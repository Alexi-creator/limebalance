import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExchangeAccount, InvestingVenue, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { BybitCredentials } from './bybit.client';
import { BybitClient } from './bybit.client';
import { PriceService } from './price.service';

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Why a venue would not delete, as a code the client can translate. The sentence beside it is a
 * fallback for anything that only knows how to print a message.
 */
export const VENUE_NOT_EMPTY = 'VENUE_NOT_EMPTY';

/** One coin of a live venue, as shown to the user. */
/** The three things a manual venue's value is assembled from. */
export interface ManualParts {
  /** Tracked coins at today's price; null when the user has not described the venue at all. */
  coinsUsd: number | null;
  adjustmentsUsd: number;
  transferredUsd: number;
}

export interface VenueCoin {
  coin: string;
  amount: number;
  usdValue: number | null;
}

/**
 * Venues: the places money sits once it has left the ledger.
 *
 * A venue connected to an exchange is LIVE — its value is *read* from the exchange on every sync
 * rather than accumulated from deposits and trades. That single choice removes the whole class of
 * "the number drifted and nobody can say why" problems: history older than the API window, top-ups
 * made outside the app, staking rewards, funding, fees — all of it is already inside the figure the
 * exchange reports, and none of it could be reconstructed reliably from what we sync.
 *
 * Everything else is MANUAL and valued from what the user tells us (tracked coins + corrections).
 */
@Injectable()
export class InvestingVenuesService {
  private readonly logger = new Logger(InvestingVenuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly prices: PriceService,
  ) {}

  /**
   * The venue standing for a connected exchange account, created on first need.
   *
   * Kept separate from the account row so that disconnecting a key does not take the money history
   * with it: the venue survives, flips to MANUAL, and its transfers stay where they are.
   */
  async ensureForAccount(account: ExchangeAccount): Promise<InvestingVenue> {
    const existing = await this.prisma.investingVenue.findUnique({
      where: { accountId: account.id },
    });
    if (existing) return existing;

    return this.prisma.investingVenue.create({
      data: {
        userId: account.userId,
        accountId: account.id,
        name: account.label || account.exchange,
        mode: 'LIVE',
      },
    });
  }

  /**
   * Reads the account's equity from the exchange and stores it on its venue.
   *
   * Deliberately never throws: a failed balance read must not fail the whole sync, and the venue
   * keeps its last known figure with its timestamp — a stale number the user can see the age of
   * beats a zero that looks like everything is gone.
   */
  async refreshLiveBalance(account: ExchangeAccount, creds: BybitCredentials): Promise<void> {
    const venue = await this.ensureForAccount(account);

    let wallet: Awaited<ReturnType<BybitClient['getWalletBalance']>>;
    try {
      wallet = await this.bybit.getWalletBalance(creds);
    } catch (err) {
      // A key without the wallet scope, or an exchange that has no such endpoint: the venue simply
      // stops being live rather than the sync failing.
      this.logger.warn(`Wallet balance unavailable for account ${account.id}: ${err}`);
      return;
    }
    if (!wallet) return;

    const equity = Number(wallet.totalEquity);
    if (!Number.isFinite(equity)) return;

    const coins: VenueCoin[] = (wallet.coin ?? [])
      .map((c) => ({
        coin: c.coin,
        amount: Number(c.walletBalance),
        usdValue: c.usdValue === '' ? null : Number(c.usdValue),
      }))
      // Bybit lists every coin the account has ever touched, zeroes included.
      .filter((c) => c.amount > 0)
      .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

    await this.prisma.investingVenue.update({
      where: { id: venue.id },
      data: {
        mode: 'LIVE',
        balanceUsd: equity,
        balanceAt: new Date(),
        coins: coins as unknown as Prisma.InputJsonValue,
        // The baseline is written exactly once, on the first successful read: whatever is on the
        // exchange the moment tracking starts was not put there through this app, so it must not
        // count as a result. Never rewritten afterwards — it is a photograph, not a running total.
        ...(venue.openingUsd === null ? { openingUsd: equity, openingAt: new Date() } : {}),
      },
    });
  }

  // --- manual venues ---

  /**
   * Creates a venue the user keeps by hand: a cold wallet, an exchange with no API key, anything
   * we cannot read. Connected exchanges never come through here — theirs is created by the sync.
   */
  async createManual(userId: string, name: string): Promise<InvestingVenue> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('A venue needs a name');

    const clash = await this.prisma.investingVenue.findFirst({
      where: { userId, name: trimmed },
    });
    if (clash) throw new BadRequestException(`You already have a venue called "${trimmed}"`);

    return this.prisma.investingVenue.create({
      data: { userId, name: trimmed, mode: 'MANUAL' },
    });
  }

  async rename(userId: string, id: string, patch: { name?: string; archived?: boolean }) {
    const venue = await this.owned(userId, id);
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new BadRequestException('A venue needs a name');

    return this.prisma.investingVenue.update({
      where: { id: venue.id },
      data: { name, archived: patch.archived },
    });
  }

  /**
   * Deletes a venue — but only an empty one, never a venue anything is recorded against.
   *
   * Deleting a card is not a way to take money out of it, and refusing here is what keeps that
   * true. Each of the three things a venue is worth would be destroyed differently and all of them
   * silently: transfers cascade, and every ledger transfer among them would hand the free balance
   * money that never actually came back; corrections cascade too, taking the reasons with them;
   * tracked coins are merely unlinked, which drops them out of every total while leaving rows
   * nothing in the app can reach any more.
   *
   * The way out is to say where the money went — a transfer to the ledger, to another venue, or
   * out to someone else — and then archive what is left. Archiving hides the card and keeps its
   * history; deleting is only ever for one created by mistake.
   */
  async remove(userId: string, id: string): Promise<{ success: true }> {
    const venue = await this.owned(userId, id);
    if (venue.accountId) {
      throw new BadRequestException(
        'This venue belongs to a connected exchange — disconnect the exchange instead.',
      );
    }

    const [transfers, holdings, adjustments] = await Promise.all([
      this.prisma.investingTransfer.count({
        where: { OR: [{ venueId: id }, { peerVenueId: id }] },
      }),
      this.prisma.holding.count({ where: { userId, venueId: id } }),
      this.prisma.investingAdjustment.count({ where: { userId, venueId: id } }),
    ]);

    // Named one by one: "not empty" leaves the user hunting for what is still in there. The counts
    // travel as data beside the sentence, so the client can say the same thing in its own language
    // and offer the two ways out instead of only reporting the refusal.
    const named = [
      transfers > 0 && `${transfers} transfer(s)`,
      holdings > 0 && `${holdings} tracked coin(s)`,
      adjustments > 0 && `${adjustments} correction(s)`,
    ].filter((b): b is string => b !== false);

    if (named.length > 0) {
      throw new BadRequestException({
        code: VENUE_NOT_EMPTY,
        blockers: { transfers, holdings, adjustments },
        message:
          `The venue still has ${named.join(', ')} on record. Move what is in it out first, ` +
          'or archive the venue instead — deleting it is not a way to withdraw from it.',
      });
    }

    await this.prisma.investingVenue.delete({ where: { id: venue.id } });
    return { success: true };
  }

  private async owned(userId: string, id: string): Promise<InvestingVenue> {
    const venue = await this.prisma.investingVenue.findFirst({ where: { id, userId } });
    if (!venue) throw new NotFoundException(`Venue ${id} not found`);
    return venue;
  }

  /**
   * What the tracked coins of each manual venue are worth right now, priced off the same Bybit
   * spot feed the portfolio uses. A coin with no ticker there is simply not counted — better a
   * figure that is short by one obscure asset than one that silently calls it zero.
   */
  async manualCoinValues(userId: string): Promise<Map<string, number>> {
    const [holdings, prices] = await Promise.all([
      this.prisma.holding.findMany({
        where: { userId, venueId: { not: null } },
        select: { venueId: true, asset: true, amount: true },
      }),
      this.prices.getUsdPrices(),
    ]);

    const byVenue = new Map<string, number>();
    for (const h of holdings) {
      const price = prices ? this.prices.priceOf(h.asset, prices) : null;
      if (price === null) continue;
      const venueId = h.venueId as string;
      byVenue.set(venueId, (byVenue.get(venueId) ?? 0) + Number(h.amount) * price);
    }
    return byVenue;
  }

  /**
   * Every coin we can put a price on, for the pickers. Built from the same spot feed the values
   * come from, so a coin that can be chosen is always a coin we can value — which is what makes
   * "no price" impossible to enter by hand.
   */
  async priceableAssets(): Promise<string[]> {
    const prices = await this.prices.getUsdPrices();
    if (!prices) return ['USDT', 'USDC', 'USD'];
    const tickers = new Set(['USDT', 'USDC', 'USD']);
    for (const symbol of prices.keys()) {
      if (symbol.endsWith('USDT')) tickers.add(symbol.slice(0, -4));
    }
    return [...tickers].sort();
  }

  /** What a venue holds of one asset right now, by its own records. */
  async trackedAmount(userId: string, venueId: string, asset: string): Promise<number> {
    const rows = await this.prisma.holding.findMany({
      where: { userId, venueId, asset: asset.toUpperCase() },
      select: { amount: true },
    });
    return rows.reduce((sum, r) => sum + Number(r.amount), 0);
  }

  /**
   * Moves a coin in or out of a venue's tracked composition.
   *
   * A LIVE venue is skipped: the exchange reports its own holdings, and writing our own row beside
   * that would count the same coin twice. A manual venue is adjusted in place; a position drained
   * to zero is removed rather than left as a zero row, and a coin arriving somewhere it has never
   * been gets a row of its own.
   */
  async applyCoinMove(
    userId: string,
    venue: InvestingVenue,
    asset: string,
    delta: number,
  ): Promise<void> {
    if (venue.mode === 'LIVE' || delta === 0) return;
    const ticker = asset.toUpperCase();

    const existing = await this.prisma.holding.findFirst({
      where: { userId, venueId: venue.id, asset: ticker },
    });
    if (!existing) {
      if (delta < 0) return; // nothing tracked to take from; the caller validated what it could
      await this.prisma.holding.create({
        data: { userId, venueId: venue.id, asset: ticker, amount: delta, location: venue.name },
      });
      return;
    }

    const next = Number(existing.amount) + delta;
    if (next <= 1e-12) {
      await this.prisma.holding.delete({ where: { id: existing.id } });
      return;
    }
    await this.prisma.holding.update({ where: { id: existing.id }, data: { amount: next } });
  }

  /** Net correction applied to each venue, summed. */
  async adjustmentTotals(userId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.investingAdjustment.groupBy({
      by: ['venueId'],
      where: { userId },
      _sum: { amountUsd: true },
    });
    return new Map(grouped.map((g) => [g.venueId, Number(g._sum.amountUsd ?? 0)]));
  }

  async listAdjustments(userId: string, venueId: string) {
    await this.owned(userId, venueId);
    const rows = await this.prisma.investingAdjustment.findMany({
      where: { venueId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      venueId: r.venueId,
      amountUsd: Number(r.amountUsd),
      note: r.note,
      date: r.date,
    }));
  }

  /**
   * Records a correction. Refused on a LIVE venue: the next sync overwrites its value with what
   * the exchange says, so the correction would vanish and the user would never learn why.
   */
  async addAdjustment(
    userId: string,
    venueId: string,
    input: { amountUsd: number; note: string; date?: Date },
  ) {
    const venue = await this.owned(userId, venueId);
    if (venue.mode === 'LIVE') {
      throw new BadRequestException(
        'This venue is read from the exchange, so a correction would be overwritten on the next sync.',
      );
    }
    if (input.amountUsd === 0)
      throw new BadRequestException('A correction of zero changes nothing');
    if (!input.note.trim()) throw new BadRequestException('A correction needs a reason');

    const row = await this.prisma.investingAdjustment.create({
      data: {
        userId,
        venueId,
        amountUsd: input.amountUsd,
        note: input.note.trim(),
        date: input.date ?? new Date(),
      },
    });
    return { ...row, amountUsd: Number(row.amountUsd) };
  }

  async removeAdjustment(userId: string, id: string): Promise<{ success: true }> {
    const row = await this.prisma.investingAdjustment.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Adjustment ${id} not found`);
    await this.prisma.investingAdjustment.delete({ where: { id } });
    return { success: true };
  }

  /** Coins of a live venue, parsed back out of the JSON snapshot. */
  coinsOf(venue: InvestingVenue): VenueCoin[] {
    if (!venue.coins) return [];
    const rows = venue.coins as unknown as VenueCoin[];
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * What a venue is worth.
   *
   * LIVE: whatever the exchange last said — it already knows about every coin and every open
   * position, so nothing is added to it.
   *
   * MANUAL: the tracked coins at today's price, and if none are tracked, whatever was put in —
   * a wallet nobody has described is at least worth the money sent to it, and showing zero there
   * would read as if it had been lost. Corrections apply either way: they are how "I sent some to
   * a friend" or "I miscounted" gets said.
   */
  valueOf(venue: InvestingVenue, parts: ManualParts): number | null {
    if (venue.mode === 'LIVE') {
      return venue.balanceUsd === null ? null : round2(Number(venue.balanceUsd));
    }
    const base = parts.coinsUsd === null ? parts.transferredUsd : parts.coinsUsd;
    return round2(base + parts.adjustmentsUsd);
  }

  /**
   * Result since tracking began: what the venue is worth now, minus what was in it at the start
   * and everything moved in or out since. Null when the value itself is unknown.
   *
   * Corrections are deliberately NOT excluded here: money that left for a friend reduces both the
   * value and the result, which is exactly right — it was spent, not lost on a trade. What keeps
   * that from reading as a trading loss is that the note says where it went.
   */
  resultOf(venue: InvestingVenue, value: number | null, netTransferredUsd: number): number | null {
    if (value === null) return null;
    const opening = venue.openingUsd === null ? 0 : Number(venue.openingUsd);
    return round2(value - opening - netTransferredUsd);
  }
}
