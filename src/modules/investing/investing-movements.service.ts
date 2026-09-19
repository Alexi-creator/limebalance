import { Injectable, Logger } from '@nestjs/common';
import type { ExchangeAccount, InvestingVenue, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient, type BybitCredentials } from './bybit.client';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';

// Bybit caps one deposit/withdrawal query at 30 days; a minute short of that stays clear of it.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000 - 60 * 1000;
// A deposit is stamped with the moment it was credited, which can lag the query that would have
// caught it — re-scan a little behind the cursor. The unique externalId makes the overlap harmless.
const OVERLAP_MS = 60 * 60 * 1000;

const DEPOSIT_SUCCESS = 3;
const INTERNAL_DEPOSIT_SUCCESS = 2;
const WITHDRAWAL_SUCCESS = 'success';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** One movement as the exchange reported it, before it becomes a transfer row. */
interface Movement {
  externalId: string;
  direction: 'IN' | 'OUT';
  asset: string;
  assetAmount: number;
  at: Date;
  counterparty: string | null;
  txId: string | null;
}

/**
 * Deposits and withdrawals, imported from the exchange's own history.
 *
 * Without this, money someone sends to the exchange raises its balance and nothing else — and a
 * live venue's result is "value minus what went in", so the gift reads as trading profit. Imported
 * movements land as transfers flagged `needsReview`, provisionally EXTERNAL: that neutralises the
 * result straight away without touching the free balance, and the user then says what it really
 * was — their own money from the ledger, a move from another venue, or someone else's.
 *
 * Only runs once FUND is being read (`openingFundAt` set), and never looks further back than that
 * moment. Both come from the same place: deposits land in FUND, so importing them while FUND is
 * invisible would count money the value does not show yet; and everything that arrived before
 * the baselines were taken is already inside them.
 */
@Injectable()
export class InvestingMovementsService {
  private readonly logger = new Logger(InvestingMovementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly venues: InvestingVenuesService,
    private readonly prices: PriceService,
  ) {}

  /** Never throws — a history we could not read must not fail a sync that otherwise worked. */
  async sync(account: ExchangeAccount, creds: BybitCredentials): Promise<void> {
    try {
      const venue = await this.venues.ensureForAccount(account);
      if (!venue.openingFundAt) return;
      await this.importSince(account, venue, creds);
    } catch (err) {
      this.logger.warn(`Deposit/withdrawal import failed for account ${account.id}: ${err}`);
    }
  }

  private async importSince(
    account: ExchangeAccount,
    venue: InvestingVenue,
    creds: BybitCredentials,
  ): Promise<void> {
    const floor = (venue.openingFundAt as Date).getTime();
    const now = Date.now();
    let from = venue.movementsSyncedTo
      ? Math.max(venue.movementsSyncedTo.getTime() - OVERLAP_MS, floor)
      : floor;

    const prices = await this.prices.getUsdPrices();

    while (from < now) {
      const to = Math.min(from + WINDOW_MS, now);
      const movements = await this.fetchWindow(creds, from, to);
      // The window boundary is not a hard edge for the exchange's own timestamps: anything stamped
      // before the baselines were taken is already inside them.
      const fresh = movements.filter((m) => m.at.getTime() >= floor);

      if (fresh.length > 0) {
        await this.prisma.investingTransfer.createMany({
          data: fresh.map((m) => this.toRow(account.userId, venue.id, m, prices)),
          skipDuplicates: true,
        });
      }
      // Advanced per window, so an interrupted run resumes where it stopped.
      await this.prisma.investingVenue.update({
        where: { id: venue.id },
        data: { movementsSyncedTo: new Date(to) },
      });
      from = to;
    }
  }

  private async fetchWindow(creds: BybitCredentials, from: number, to: number) {
    const range = { startTime: from, endTime: to };
    const [onChain, internal, withdrawals] = await Promise.all([
      this.pages((cursor) => this.bybit.getDeposits(creds, { ...range, cursor })),
      this.pages((cursor) => this.bybit.getInternalDeposits(creds, { ...range, cursor })),
      this.pages((cursor) => this.bybit.getWithdrawals(creds, { ...range, cursor })),
    ]);

    const movements: Movement[] = [];
    const internalTx = new Set<string>();

    for (const r of internal) {
      if (Number(r.status) !== INTERNAL_DEPOSIT_SUCCESS) continue;
      if (r.txID) internalTx.add(r.txID);
      movements.push({
        externalId: `internal:${r.id}`,
        direction: 'IN',
        asset: r.coin,
        assetAmount: Number(r.amount),
        at: new Date(Number(r.createdTime)),
        counterparty: r.address || null,
        txId: r.txID || null,
      });
    }

    for (const r of onChain) {
      if (Number(r.status) !== DEPOSIT_SUCCESS) continue;
      // Should an internal transfer ever show up in both lists, the internal one wins — it is the
      // one that knows who sent it.
      if (r.txID && internalTx.has(r.txID)) continue;
      movements.push({
        externalId: `deposit:${r.id || `${r.txID}:${r.txIndex ?? 0}`}`,
        direction: 'IN',
        asset: r.coin,
        assetAmount: Number(r.amount),
        at: new Date(Number(r.successAt)),
        counterparty: r.fromAddress || null,
        txId: r.txID || null,
      });
    }

    for (const r of withdrawals) {
      if (r.status !== WITHDRAWAL_SUCCESS) continue;
      movements.push({
        externalId: `withdrawal:${r.withdrawId}`,
        direction: 'OUT',
        asset: r.coin,
        // What was sent, not what the recipient got net of the fee: the fee is a real cost of the
        // venue and belongs in its result, not hidden inside the transfer.
        assetAmount: Number(r.amount),
        at: new Date(Number(r.updateTime)),
        counterparty: r.toAddress || null,
        txId: r.txID || null,
      });
    }

    return movements.filter((m) => m.assetAmount > 0 && !Number.isNaN(m.at.getTime()));
  }

  private async pages<T>(
    fetch: (cursor?: string) => Promise<{ rows: T[]; nextPageCursor: string }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetch(cursor);
      rows.push(...(page.rows ?? []));
      cursor = page.nextPageCursor || undefined;
    } while (cursor);
    return rows;
  }

  /**
   * Priced at the moment of import, not at the movement's own time: the sync runs every couple of
   * minutes, so the two are the same for anything new. A coin with no ticker is kept with no USD
   * figure — still on record and still visible, just out of the USD totals, the same rule manual
   * transfers follow when no rate exists.
   */
  private toRow(
    userId: string,
    venueId: string,
    m: Movement,
    prices: Map<string, number> | null,
  ): Prisma.InvestingTransferCreateManyInput {
    const price = prices ? this.prices.priceOf(m.asset, prices) : null;
    const usd = price === null ? null : round2(m.assetAmount * price);
    return {
      userId,
      venueId,
      direction: m.direction,
      peer: 'EXTERNAL',
      amount: usd ?? 0,
      currency: 'USD',
      amountUsd: usd,
      asset: m.asset.toUpperCase(),
      assetAmount: m.assetAmount,
      date: m.at,
      source: 'BYBIT',
      externalId: m.externalId,
      counterparty: m.counterparty?.slice(0, 200) ?? null,
      txId: m.txId,
      needsReview: true,
    };
  }
}
