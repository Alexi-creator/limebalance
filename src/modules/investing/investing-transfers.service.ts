import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { InvestingTransfer, InvestingVenue, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService, type Rates } from '../currency/currency.service';
import { FxRatesService } from '../currency/fx-rates.service';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';

const MAX_PAGE = 200;
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface CurrencyRow {
  currency: string;
  amount: number;
}

export interface TransfersQuery {
  venueId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface CreateTransferInput {
  venueId: string;
  direction: 'IN' | 'OUT';
  peer: 'LEDGER' | 'VENUE' | 'EXTERNAL';
  peerVenueId?: string;
  /** In `currency`. Ignored when the move is made in a coin — the price decides the figure then. */
  amount?: number;
  currency?: string;
  /** Ticker, when the move is a coin rather than money. Not allowed against the ledger. */
  asset?: string;
  assetAmount?: number;
  date?: Date;
  note?: string;
}

type TransferWithVenues = InvestingTransfer & {
  venue: { name: string };
  peerVenue: { name: string } | null;
};

/**
 * Money moving in and out of the places it is invested.
 *
 * The one rule everything else follows: only a transfer whose peer is the LEDGER touches the free
 * balance. Moving coins from an exchange to a cold wallet changes no net worth and no ledger;
 * sending them to someone else reduces net worth without the ledger ever seeing the money back.
 * Keeping those three apart is what lets the result stay honest — without the EXTERNAL case, coins
 * leaving the exchange would read as a trading loss.
 */
@Injectable()
export class InvestingTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
    private readonly fx: FxRatesService,
    private readonly venues: InvestingVenuesService,
    private readonly prices: PriceService,
  ) {}

  // --- transfers ---

  async list(userId: string, query: TransfersQuery) {
    const where: Prisma.InvestingTransferWhereInput = {
      userId,
      ...(query.venueId
        ? { OR: [{ venueId: query.venueId }, { peerVenueId: query.venueId }] }
        : {}),
      ...(query.from || query.to ? { date: { gte: query.from, lte: query.to } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.investingTransfer.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { venue: { select: { name: true } }, peerVenue: { select: { name: true } } },
        take: Math.min(query.limit ?? 50, MAX_PAGE),
        skip: query.offset ?? 0,
      }),
      this.prisma.investingTransfer.count({ where }),
    ]);

    return { items: rows.map((r) => this.present(r)), total };
  }

  async create(userId: string, input: CreateTransferInput) {
    const venue = await this.ownedVenue(userId, input.venueId);
    const peerVenueId = await this.resolvePeer(userId, input, venue);
    const date = input.date ?? new Date();
    const coin = await this.resolveCoin(userId, input, venue);

    // A coin move is denominated by its price, and the ledger is never on the other side of one —
    // your wallet holds money, not satoshis, so there would be nothing to take the coin out of.
    const currency = coin ? 'USD' : (input.currency ?? 'USD');
    const amount = coin ? coin.usd : (input.amount ?? 0);
    if (amount <= 0) {
      throw new BadRequestException('amount must be positive — use `direction` for the sign');
    }

    const row = await this.prisma.investingTransfer.create({
      data: {
        userId,
        venueId: venue.id,
        direction: input.direction,
        peer: input.peer,
        peerVenueId,
        amount,
        currency,
        amountUsd: coin ? coin.usd : await this.toUsd(amount, currency, date),
        asset: coin?.asset ?? null,
        assetAmount: coin?.amount ?? null,
        note: input.note ?? null,
        date,
      },
      include: { venue: { select: { name: true } }, peerVenue: { select: { name: true } } },
    });

    if (coin) await this.shiftComposition(userId, row.id, 1);
    return this.present(row);
  }

  async update(userId: string, id: string, input: Partial<CreateTransferInput>) {
    const existing = await this.owned(userId, id);
    // Editing the size of a coin move would have to unwind the composition it already shifted and
    // re-apply it — two chances to get the books wrong. Delete it and record the real one instead.
    if (existing.asset && (input.amount !== undefined || input.currency !== undefined)) {
      throw new BadRequestException(
        'This transfer was made in a coin — delete it and record a new one to change the amount.',
      );
    }
    if (input.amount !== undefined && input.amount <= 0) {
      throw new BadRequestException('amount must be positive — use `direction` for the sign');
    }

    const amount = input.amount ?? Number(existing.amount);
    const currency = input.currency ?? existing.currency;
    const date = input.date ?? existing.date;
    // Re-priced whenever the amount, the currency or the date moves — the USD figure is pinned to
    // the operation's own day, so any of the three changing makes the stored one wrong.
    const repriced =
      input.amount !== undefined || input.currency !== undefined || input.date !== undefined;

    const row = await this.prisma.investingTransfer.update({
      where: { id },
      data: {
        direction: input.direction,
        amount: input.amount,
        currency: input.currency,
        date: input.date,
        note: input.note,
        ...(repriced ? { amountUsd: await this.toUsd(amount, currency, date) } : {}),
      },
      include: { venue: { select: { name: true } }, peerVenue: { select: { name: true } } },
    });
    return this.present(row);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const row = await this.owned(userId, id);
    // Put the coins back where they were before deleting the record of having moved them.
    if (row.asset) await this.shiftComposition(userId, id, -1);
    await this.prisma.investingTransfer.delete({ where: { id } });
    return { success: true };
  }

  // --- venues with their figures ---

  /** Every venue with what was put in, what it is worth now, and the difference. */
  async listVenues(userId: string) {
    const [venues, netByVenue, coinValues, adjustments, user, rates] = await Promise.all([
      this.prisma.investingVenue.findMany({
        where: { userId },
        orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
      }),
      this.netTransferredUsdByVenue(userId),
      this.venues.manualCoinValues(userId),
      this.venues.adjustmentTotals(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
    ]);

    const items = venues.map((venue) => {
      const transferred = round2(netByVenue.get(venue.id) ?? 0);
      const value = this.venues.valueOf(venue, {
        coinsUsd: coinValues.get(venue.id) ?? null,
        adjustmentsUsd: adjustments.get(venue.id) ?? 0,
        transferredUsd: transferred,
      });
      return {
        id: venue.id,
        name: venue.name,
        accountId: venue.accountId,
        mode: venue.mode,
        archived: venue.archived,
        transferredUsd: transferred,
        valueUsd: value,
        resultUsd: this.venues.resultOf(venue, value, transferred),
        openingUsd: venue.openingUsd === null ? null : Number(venue.openingUsd),
        adjustmentsUsd: round2(adjustments.get(venue.id) ?? 0),
        valueAt: venue.balanceAt,
        coins: this.venues.coinsOf(venue),
      };
    });

    const baseCurrency = user?.currency ?? 'USD';
    const totalUsd = items.reduce((sum, i) => sum + (i.valueUsd ?? 0), 0);
    const investedUsd = items.reduce((sum, i) => sum + i.transferredUsd + (i.openingUsd ?? 0), 0);

    return {
      items,
      baseCurrency,
      totalUsd: round2(totalUsd),
      // The same total in the user's own currency, for the cards that live outside this section.
      totalBase: this.toBase(totalUsd, baseCurrency, rates),
      investedUsd: round2(investedUsd),
      resultUsd: round2(totalUsd - investedUsd),
      // A venue whose value could not be read at all makes every total a lower bound.
      isPartial: items.some((i) => i.valueUsd === null),
    };
  }

  // --- balance integration ---

  /**
   * What every venue is worth right now, in USD — the figure the balance reports as "invested".
   *
   * Deliberately the value and not the amount transferred: money paid out of a venue to someone
   * else never comes back to the ledger, so reporting what was *sent* would keep counting it and
   * quietly overstate net worth by exactly that much.
   */
  async totalValueUsd(userId: string): Promise<number> {
    const [venues, netByVenue, coinValues, adjustments] = await Promise.all([
      this.prisma.investingVenue.findMany({ where: { userId } }),
      this.netTransferredUsdByVenue(userId),
      this.venues.manualCoinValues(userId),
      this.venues.adjustmentTotals(userId),
    ]);

    return round2(
      venues.reduce((sum, venue) => {
        const value = this.venues.valueOf(venue, {
          coinsUsd: coinValues.get(venue.id) ?? null,
          adjustmentsUsd: adjustments.get(venue.id) ?? 0,
          transferredUsd: netByVenue.get(venue.id) ?? 0,
        });
        return sum + (value ?? 0);
      }, 0),
    );
  }

  /**
   * Net moved out of the ledger per currency — the only thing the free balance reads here.
   *
   * Transfers whose peer is another venue or the outside world are skipped on purpose: the money
   * never passed back through the wallet, so pretending it did would move a balance that nothing
   * actually changed.
   */
  async transferRows(userId: string): Promise<CurrencyRow[]> {
    const grouped = await this.prisma.investingTransfer.groupBy({
      by: ['currency', 'direction'],
      where: { userId, peer: 'LEDGER' },
      _sum: { amount: true },
    });

    const net = new Map<string, number>();
    for (const g of grouped) {
      const amount = Number(g._sum.amount ?? 0);
      const signed = g.direction === 'IN' ? amount : -amount;
      net.set(g.currency, (net.get(g.currency) ?? 0) + signed);
    }
    return [...net].map(([currency, amount]) => ({ currency, amount: round2(amount) }));
  }

  // --- internals ---

  private async owned(userId: string, id: string): Promise<InvestingTransfer> {
    const row = await this.prisma.investingTransfer.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Transfer ${id} not found`);
    return row;
  }

  private async ownedVenue(userId: string, id: string): Promise<InvestingVenue> {
    const venue = await this.prisma.investingVenue.findFirst({ where: { id, userId } });
    if (!venue) throw new NotFoundException(`Venue ${id} not found`);
    return venue;
  }

  /**
   * Validates a coin move and prices it. Returns null for an ordinary money transfer.
   *
   * Coins never move against the ledger: a wallet holds money, so there would be nothing on the
   * other side to take them out of — that case is an ordinary withdrawal in the currency received.
   */
  private async resolveCoin(
    userId: string,
    input: CreateTransferInput,
    venue: InvestingVenue,
  ): Promise<{ asset: string; amount: number; usd: number } | null> {
    if (!input.asset) return null;
    if (input.peer === 'LEDGER') {
      throw new BadRequestException(
        'A coin cannot move to or from your balance — record the money that changed hands instead.',
      );
    }
    const amount = input.assetAmount ?? 0;
    if (amount <= 0) throw new BadRequestException('assetAmount must be positive');

    const asset = input.asset.toUpperCase();
    const prices = await this.prices.getUsdPrices();
    const price = prices ? this.prices.priceOf(asset, prices) : null;
    if (price === null) {
      throw new BadRequestException(`No price for ${asset} — record the move in USD instead.`);
    }

    // Only the venue the coin leaves is checked, and only when we actually track its contents:
    // a live exchange knows its own holdings, and a venue nobody has described cannot contradict us.
    const source = input.direction === 'OUT' ? venue : await this.peerVenueOf(userId, input);
    if (source && source.mode === 'MANUAL') {
      const tracked = await this.venues.trackedAmount(userId, source.id, asset);
      if (tracked > 0 && amount > tracked + 1e-12) {
        throw new BadRequestException(
          `${source.name} only has ${tracked} ${asset} on record — move at most that.`,
        );
      }
    }

    return { asset, amount, usd: round2(amount * price) };
  }

  /**
   * Applies a coin transfer to both sides' compositions, or takes it back when `sign` is -1.
   * Live venues are skipped inside applyCoinMove — the exchange reports its own coins.
   */
  private async shiftComposition(userId: string, transferId: string, sign: 1 | -1): Promise<void> {
    const row = await this.prisma.investingTransfer.findUnique({
      where: { id: transferId },
      include: { venue: true, peerVenue: true },
    });
    if (!row?.asset || row.assetAmount === null) return;

    const qty = Number(row.assetAmount) * sign;
    const towardsVenue = row.direction === 'IN' ? qty : -qty;
    await this.venues.applyCoinMove(userId, row.venue, row.asset, towardsVenue);
    if (row.peerVenue) {
      await this.venues.applyCoinMove(userId, row.peerVenue, row.asset, -towardsVenue);
    }
  }

  private async peerVenueOf(
    userId: string,
    input: CreateTransferInput,
  ): Promise<InvestingVenue | null> {
    if (input.peer !== 'VENUE' || !input.peerVenueId) return null;
    return this.prisma.investingVenue.findFirst({ where: { id: input.peerVenueId, userId } });
  }

  private async resolvePeer(
    userId: string,
    input: CreateTransferInput,
    venue: InvestingVenue,
  ): Promise<string | null> {
    if (input.peer !== 'VENUE') return null;
    if (!input.peerVenueId) {
      throw new BadRequestException('A venue-to-venue transfer needs peerVenueId');
    }
    if (input.peerVenueId === venue.id) {
      throw new BadRequestException('A transfer cannot have the same venue on both sides');
    }
    await this.ownedVenue(userId, input.peerVenueId);
    return input.peerVenueId;
  }

  /**
   * Net USD moved into each venue, counting both sides of a venue-to-venue move: one row is the
   * whole story of that move, so the venue on the far side of it has to read the same row mirrored.
   */
  private async netTransferredUsdByVenue(userId: string): Promise<Map<string, number>> {
    const [own, mirrored] = await Promise.all([
      this.prisma.investingTransfer.groupBy({
        by: ['venueId', 'direction'],
        where: { userId },
        _sum: { amountUsd: true },
      }),
      this.prisma.investingTransfer.groupBy({
        by: ['peerVenueId', 'direction'],
        where: { userId, peer: 'VENUE', peerVenueId: { not: null } },
        _sum: { amountUsd: true },
      }),
    ]);

    const net = new Map<string, number>();
    const add = (venueId: string, amount: number) =>
      net.set(venueId, (net.get(venueId) ?? 0) + amount);

    for (const g of own) {
      const usd = Number(g._sum.amountUsd ?? 0);
      add(g.venueId, g.direction === 'IN' ? usd : -usd);
    }
    for (const g of mirrored) {
      const usd = Number(g._sum.amountUsd ?? 0);
      // Mirrored: what went INTO this venue left the other one, and the other way round.
      add(g.peerVenueId as string, g.direction === 'IN' ? -usd : usd);
    }
    return net;
  }

  /**
   * The USD value of an amount on the day it happened: the stored rate first, today's live rate as
   * a fallback, and null when neither exists — a transfer we cannot price is still a transfer.
   */
  private async toUsd(amount: number, currency: string, date: Date): Promise<number | null> {
    if (currency === 'USD') return amount;
    const historical = await this.fx.convertOn(amount, currency, 'USD', date);
    if (historical !== null) return historical;
    const rates = await this.currency.getRates();
    if (!rates) return null;
    return this.currency.convertWithRates(rates, amount, currency, 'USD');
  }

  private toBase(usd: number, baseCurrency: string, rates: Rates | null): number | null {
    if (baseCurrency === 'USD') return round2(usd);
    if (!rates) return null;
    const converted = this.currency.convertWithRates(rates, usd, 'USD', baseCurrency);
    return converted === null ? null : round2(converted);
  }

  private present(row: TransferWithVenues) {
    return {
      id: row.id,
      venueId: row.venueId,
      venueName: row.venue.name,
      direction: row.direction,
      peer: row.peer,
      peerVenueId: row.peerVenueId,
      peerVenueName: row.peerVenue?.name ?? null,
      amount: Number(row.amount),
      currency: row.currency,
      asset: row.asset,
      assetAmount: row.assetAmount === null ? null : Number(row.assetAmount),
      amountUsd: row.amountUsd === null ? null : Number(row.amountUsd),
      note: row.note,
      date: row.date,
    };
  }
}
