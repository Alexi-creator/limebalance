import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExchangeAccount, P2pOrder, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BybitApiError,
  BybitClient,
  type BybitCredentials,
  type BybitP2pOrder,
} from './bybit.client';
import { decryptSecret } from './crypto.util';
import { InvestingTransfersService } from './investing-transfers.service';
import { P2P_DONE, p2pExternalId } from './p2p.util';

/** Why the P2P history could not be read, as a code the client can explain in its own words. */
export const P2P_UNAVAILABLE = 'P2P_UNAVAILABLE';

const DAY_MS = 24 * 60 * 60 * 1000;
// Bybit's own cap on one page.
const BYBIT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
// The furthest back Bybit's API goes at all. Without an explicit range it returns only 90 days.
const HISTORY_DAYS = 180;
// …but one request may span at most 90 days — asking for more is refused outright (retCode
// 912120130), so the range is walked in windows. Splitting it evenly keeps every window strictly
// under the cap, so this figure needs no safety margin of its own.
const WINDOW_MS = 90 * DAY_MS;
// Re-read behind the last sync on every run: an order stays open, or in dispute, for a while after
// it was placed, and its status has to catch up. Seven days covers all but the longest disputes.
const REFRESH_BEHIND_MS = 7 * DAY_MS;
// How stale the copy may get before a read of the tab refreshes it first, and before the
// background sync bothers Bybit again.
const FRESH_FOR_TAB_MS = 2 * 60 * 1000;
const FRESH_FOR_CRON_MS = 30 * 60 * 1000;
// A runaway page loop would hammer Bybit; 180 days of P2P fits in far fewer pages than this.
const MAX_PAGES = 200;

export type P2pStatus = 'DONE' | 'CANCELLED' | 'DISPUTE' | 'ACTIVE';

/** Bybit's numeric statuses folded into the four that change what the user can do with an order. */
function statusOf(code: number): P2pStatus {
  if (code === P2P_DONE) return 'DONE';
  if (code === 40 || code === 80) return 'CANCELLED';
  if (code === 30 || code === 100 || code === 110) return 'DISPUTE';
  return 'ACTIVE';
}

export interface P2pListQuery {
  accountId?: string;
  page?: number;
  size?: number;
}

/**
 * P2P orders, copied from Bybit into our own table and kept there.
 *
 * Bybit's API reaches only 180 days back, so reading it live would show a window that keeps
 * sliding — everything older quietly disappears. Copying every order we see makes the history
 * grow instead: from the first sync on, nothing seen once is lost, even if the key is disconnected.
 *
 * Why the orders matter beyond the table: buying USDT on P2P credits FUND without any deposit
 * record, so the import in InvestingMovementsService never sees it and the coins would read as
 * trading profit. Recording the order as a transfer from the balance is how that money is explained.
 */
@Injectable()
export class InvestingP2pService {
  private readonly logger = new Logger(InvestingP2pService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly config: ConfigService,
    private readonly transfers: InvestingTransfersService,
  ) {}

  /**
   * Called from the regular account sync. Throttled — P2P history changes on the scale of hours,
   * not the two minutes the trade sync runs at — and never throws: an account without the P2P
   * permission is a normal state, not a failed sync.
   */
  async syncIfDue(account: ExchangeAccount, creds: BybitCredentials): Promise<void> {
    if (!this.isDue(account, FRESH_FOR_CRON_MS)) return;
    await this.sync(account, creds).catch(() => undefined);
  }

  /**
   * Copies every order from the window into the table. The window starts 180 days back on the very
   * first run (all Bybit still has), and a week behind the last successful run afterwards.
   * Records the outcome on the account, and rethrows the failure for callers that care.
   */
  async sync(account: ExchangeAccount, creds: BybitCredentials): Promise<void> {
    const now = Date.now();
    // A minute short of the limit, so clock drift never pushes the start past what Bybit allows.
    const oldest = now - HISTORY_DAYS * DAY_MS + 60_000;
    const begin = account.p2pSyncedAt
      ? Math.max(account.p2pSyncedAt.getTime() - REFRESH_BEHIND_MS, oldest)
      : oldest;

    try {
      // Split evenly rather than in fixed steps, so a 180-day range is two 90-day windows and
      // never a third one covering the last few seconds.
      const windows = Math.max(1, Math.ceil((now - begin) / WINDOW_MS));
      const step = Math.ceil((now - begin) / windows);
      for (let i = 0; i < windows; i += 1) {
        const from = begin + i * step;
        const to = Math.min(from + step, now);
        let page = 1;
        let seen = 0;
        while (page <= MAX_PAGES) {
          const result = await this.bybit.getP2pOrders(creds, {
            page,
            size: BYBIT_PAGE_SIZE,
            beginTime: String(from),
            endTime: String(to),
          });
          const items = result.items ?? [];
          for (const order of items) await this.upsert(account, order);
          seen += items.length;
          if (items.length < BYBIT_PAGE_SIZE || seen >= Number(result.count ?? 0)) break;
          page += 1;
        }
      }

      await this.autoRecord(account);

      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: { p2pSyncedAt: new Date(now), p2pError: null },
      });
    } catch (err) {
      this.logger.warn(`P2P sync failed for account ${account.id}: ${err}`);
      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: {
          p2pError: err instanceof BybitApiError ? `${err.retCode}: ${err.message}` : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * One page of the user's saved orders, newest first — refreshed from Bybit first when the copy
   * is more than a couple of minutes old, so an order just placed shows up when the tab is opened.
   *
   * A failed refresh does not hide what is already saved. Only when nothing is saved *and* Bybit
   * refused is the answer an error, since then there is nothing to show but the reason.
   */
  async list(userId: string, query: P2pListQuery = {}) {
    const accounts = await this.prisma.exchangeAccount.findMany({
      where: {
        userId,
        exchange: 'bybit',
        ...(query.accountId ? { id: query.accountId } : {}),
      },
    });
    if (query.accountId && accounts.length === 0) {
      throw new NotFoundException(`Exchange account ${query.accountId} not found`);
    }

    const failures: { retCode: number | null; message: string }[] = [];
    for (const account of accounts) {
      if (account.status === 'DISABLED') continue;
      const failure = await this.refreshForTab(account);
      if (failure) failures.push(failure);
    }

    const size = Math.min(Math.max(1, query.size ?? 20), MAX_PAGE_SIZE);
    const page = Math.max(1, query.page ?? 1);
    const where: Prisma.P2pOrderWhereInput = {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
    };
    const [rows, total, refreshed] = await Promise.all([
      this.prisma.p2pOrder.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        take: size,
        skip: (page - 1) * size,
      }),
      this.prisma.p2pOrder.count({ where }),
      // Read again: the refresh above has just moved these.
      this.prisma.exchangeAccount.findMany({
        where: { id: { in: accounts.map((a) => a.id) } },
        select: { p2pSyncedAt: true },
      }),
    ]);

    const failure = failures[0]
      ? { code: P2P_UNAVAILABLE, retCode: failures[0].retCode ?? 0, message: failures[0].message }
      : null;
    if (total === 0 && failure) throw new BadRequestException(failure);

    return {
      total,
      items: await this.present(userId, rows),
      // The oldest successful read across the accounts shown — how current the table is.
      syncedAt: oldestDate(refreshed.map((a) => a.p2pSyncedAt)),
      // Saved history is shown regardless; this says the latest refresh did not get through.
      syncError: failure,
    };
  }

  // --- internals ---

  /**
   * With auto-recording on, every completed order placed since it was switched on becomes a wallet
   * transfer. Looked up in our own table rather than in the page just read, so an order that
   * completes days after it was placed (a dispute resolved) is still picked up on a later run.
   */
  private async autoRecord(account: ExchangeAccount): Promise<void> {
    if (!account.p2pAutoRecordFrom) return;
    const venue = await this.prisma.investingVenue.findUnique({ where: { accountId: account.id } });
    if (!venue) return;

    const orders = await this.prisma.p2pOrder.findMany({
      where: {
        accountId: account.id,
        status: P2P_DONE,
        placedAt: { gte: account.p2pAutoRecordFrom },
      },
    });
    await this.transfers.recordP2pOrders(account.userId, venue.id, orders);
  }

  private isDue(account: ExchangeAccount, freshFor: number): boolean {
    return !account.p2pSyncedAt || Date.now() - account.p2pSyncedAt.getTime() > freshFor;
  }

  /** Refreshes one account if its copy is stale. Returns why it failed, or null. */
  private async refreshForTab(
    account: ExchangeAccount,
  ): Promise<{ retCode: number | null; message: string } | null> {
    if (!this.isDue(account, FRESH_FOR_TAB_MS)) {
      // Fresh enough to skip Bybit — but a failure since then is still worth saying.
      return account.p2pError ? parseStoredError(account.p2pError) : null;
    }
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) return { retCode: null, message: 'ENCRYPTION_KEY missing' };

    try {
      await this.sync(account, {
        apiKey: decryptSecret(account.apiKey, key),
        apiSecret: decryptSecret(account.apiSecret, key),
      });
      return null;
    } catch (err) {
      return err instanceof BybitApiError
        ? { retCode: err.retCode, message: err.message }
        : { retCode: null, message: String(err) };
    }
  }

  private async upsert(account: ExchangeAccount, o: BybitP2pOrder): Promise<void> {
    const data = {
      accountId: account.id,
      side: o.side === 0 ? 'BUY' : 'SELL',
      asset: o.tokenId,
      quantity: o.notifyTokenQuantity ?? o.quantity ?? '0',
      fiatAmount: o.amount,
      fiatCurrency: o.currencyId,
      price: o.price,
      fee: o.fee || null,
      counterparty: o.targetNickName || null,
      status: Number(o.status),
      placedAt: new Date(Number(o.createDate)),
      raw: o as Prisma.InputJsonValue,
    };
    await this.prisma.p2pOrder.upsert({
      where: { userId_orderId: { userId: account.userId, orderId: o.id } },
      create: { userId: account.userId, orderId: o.id, ...data },
      update: data,
    });
  }

  /** Rows as the table shows them, with where a recorded one's transfer went. */
  private async present(userId: string, rows: P2pOrder[]) {
    const accountIds = [
      ...new Set(rows.map((r) => r.accountId).filter((id): id is string => !!id)),
    ];
    const [venues, recorded] = await Promise.all([
      this.prisma.investingVenue.findMany({
        where: { userId, accountId: { in: accountIds } },
        select: { id: true, accountId: true },
      }),
      this.prisma.investingTransfer.findMany({
        where: { userId, externalId: { in: rows.map((r) => p2pExternalId(r.orderId)) } },
        select: { id: true, externalId: true, source: true },
      }),
    ]);
    const venueByAccount = new Map(venues.map((v) => [v.accountId, v.id]));
    const transferByOrder = new Map(recorded.map((r) => [r.externalId, r]));

    return rows.map((r) => ({
      id: r.orderId,
      accountId: r.accountId,
      // Where recording it would send the transfer; null once the account is gone.
      venueId: r.accountId ? (venueByAccount.get(r.accountId) ?? null) : null,
      side: r.side as 'BUY' | 'SELL',
      asset: r.asset,
      quantity: Number(r.quantity),
      fiatAmount: Number(r.fiatAmount),
      fiatCurrency: r.fiatCurrency,
      price: Number(r.price),
      fee: r.fee === null ? null : Number(r.fee),
      counterparty: r.counterparty,
      status: statusOf(r.status),
      createdAt: r.placedAt,
      transferId: transferByOrder.get(p2pExternalId(r.orderId))?.id ?? null,
      // Recorded by the auto-recording rather than by hand.
      autoRecorded: transferByOrder.get(p2pExternalId(r.orderId))?.source === 'BYBIT',
    }));
  }
}

function oldestDate(dates: (Date | null)[]): Date | null {
  const known = dates.filter((d): d is Date => d !== null);
  if (known.length === 0) return null;
  return new Date(Math.min(...known.map((d) => d.getTime())));
}

/** Reads back "retCode: message" as written by sync(); anything else is kept as the message. */
function parseStoredError(stored: string): { retCode: number | null; message: string } {
  const match = /^(\d+): (.*)$/s.exec(stored);
  return match
    ? { retCode: Number(match[1]), message: match[2] }
    : { retCode: null, message: stored };
}
