import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { InvestingTransfer, InvestingVenue, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService, type Rates } from '../currency/currency.service';
import { FxRatesService } from '../currency/fx-rates.service';
import { p2pExternalId } from './investing-p2p.service';
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
  /** Only the imported movements still waiting to be explained. */
  needsReview?: boolean;
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
  /** The Bybit P2P order this transfer records — one order can be recorded only once. */
  p2pOrderId?: string;
}

/**
 * What an imported movement really was. The exchange knows the coin that arrived or left; only the
 * user knows whose money it was.
 */
export interface ClassifyTransferInput {
  peer: 'LEDGER' | 'VENUE' | 'EXTERNAL';
  peerVenueId?: string;
  /** peer = LEDGER only: what actually left or reached the wallet, in its own currency. */
  amount?: number;
  currency?: string;
  note?: string;
  /**
   * A transfer the user already recorded by hand for this same movement. It is removed and its
   * peer, amount and note are carried over — the imported row stays, since it is the one the
   * exchange will keep reporting.
   */
  replacesId?: string;
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
 * the outside world moves net worth without the ledger ever seeing the money — out to someone
 * else, or in from someone else and from holdings that predate the app.
 * Keeping those three apart is what lets the result stay honest — without the EXTERNAL case, coins
 * leaving the exchange would read as a trading loss, and coins that arrived from outside as a
 * profit made out of nothing.
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
      ...(query.needsReview !== undefined ? { needsReview: query.needsReview } : {}),
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

    if (input.p2pOrderId) {
      // Checked up front rather than left to the unique index: a clear sentence beats a 500.
      const taken = await this.prisma.investingTransfer.findFirst({
        where: { venueId: venue.id, externalId: p2pExternalId(input.p2pOrderId) },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('This P2P order is already recorded.');
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
        // Still MANUAL: the user decided what the order was, the exchange only reported it.
        externalId: input.p2pOrderId ? p2pExternalId(input.p2pOrderId) : null,
      },
      include: { venue: { select: { name: true } }, peerVenue: { select: { name: true } } },
    });

    if (coin) await this.shiftComposition(userId, row.id, 1);
    return this.present(row);
  }

  async update(userId: string, id: string, input: Partial<CreateTransferInput>) {
    const existing = await this.owned(userId, id);
    // An imported movement is the exchange's record, not the user's: its size, direction and day
    // are facts. What it was is said through classify(); only the note is free.
    const touchesFacts =
      input.direction !== undefined ||
      input.amount !== undefined ||
      input.currency !== undefined ||
      input.date !== undefined;
    if (existing.source !== 'MANUAL' && touchesFacts) {
      throw new BadRequestException(
        'This transfer comes from the exchange — only its note can be edited. Use classify to say ' +
          'where the money came from or went.',
      );
    }
    // Editing the size or direction of a coin move would have to unwind the composition it already shifted and
    // re-apply it — two chances to get the books wrong. Delete it and record the real one instead.
    const flipped = input.direction !== undefined && input.direction !== existing.direction;
    if (existing.asset && (input.amount !== undefined || input.currency !== undefined || flipped)) {
      throw new BadRequestException(
        'This transfer was made in a coin — delete it and record a new one to change the amount ' +
          'or the direction.',
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
    // Deleting an imported movement would not make it untrue — the balance still moved, and the
    // result would quietly count it as profit or loss again. Classifying it is the way to say what
    // it was, EXTERNAL included.
    if (row.source !== 'MANUAL') {
      throw new BadRequestException(
        'This transfer comes from the exchange and cannot be deleted — classify it instead.',
      );
    }
    // Put the coins back where they were before deleting the record of having moved them.
    if (row.asset) await this.shiftComposition(userId, id, -1);
    await this.prisma.investingTransfer.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Says what an imported movement was. Can be repeated — a second answer replaces the first.
   *
   * The USD figure is never touched: it is what actually reached or left the exchange, priced on
   * arrival, and the venue's result is measured against exactly that. Against the LEDGER the
   * amount and currency become what moved in the wallet instead — the two can differ by whatever
   * the conversion cost, which is a real cost and shows up in net worth, not as a trading result.
   */
  async classify(userId: string, id: string, input: ClassifyTransferInput) {
    const row = await this.owned(userId, id);
    if (row.source === 'MANUAL') {
      throw new BadRequestException(
        'Only transfers imported from the exchange are classified — edit this one instead.',
      );
    }
    const venue = await this.ownedVenue(userId, row.venueId);
    const answer = input.replacesId ? await this.takeOver(userId, row, input) : input;

    if (answer.peer === 'LEDGER' && !(answer.amount && answer.amount > 0 && answer.currency)) {
      throw new BadRequestException(
        'Say how much left or reached your balance, and in which currency.',
      );
    }
    const peerVenueId = await this.resolvePeer(
      userId,
      { ...answer, venueId: venue.id, direction: row.direction },
      venue,
    );

    // The coin moved on the far side of a venue-to-venue move is the only composition an imported
    // row ever shifts (see shiftComposition). Undone first, so a changed answer starts clean.
    await this.shiftComposition(userId, id, -1);

    const toLedger = answer.peer === 'LEDGER';
    await this.prisma.investingTransfer.update({
      where: { id },
      data: {
        peer: answer.peer,
        peerVenueId,
        amount: toLedger ? answer.amount : Number(row.amountUsd ?? 0),
        currency: toLedger ? answer.currency : 'USD',
        note: answer.note?.trim() || null,
        needsReview: false,
      },
    });
    await this.shiftComposition(userId, id, 1);

    const updated = await this.prisma.investingTransfer.findUniqueOrThrow({
      where: { id },
      include: { venue: { select: { name: true } }, peerVenue: { select: { name: true } } },
    });
    return this.present(updated);
  }

  /**
   * Folds a hand-recorded duplicate into the imported row: its answer is taken over, and it is
   * removed the ordinary way, so any coins it moved are put back before the imported row moves
   * them again.
   */
  private async takeOver(
    userId: string,
    imported: InvestingTransfer,
    input: ClassifyTransferInput,
  ): Promise<ClassifyTransferInput> {
    const manual = await this.owned(userId, input.replacesId as string);
    if (
      manual.source !== 'MANUAL' ||
      manual.venueId !== imported.venueId ||
      manual.direction !== imported.direction
    ) {
      throw new BadRequestException(
        'Only a transfer you recorded by hand, for the same venue and in the same direction, can ' +
          'be merged into this one.',
      );
    }
    await this.remove(userId, manual.id);
    return {
      peer: manual.peer,
      peerVenueId: manual.peerVenueId ?? undefined,
      amount: Number(manual.amount),
      currency: manual.currency,
      note: input.note?.trim() || manual.note || undefined,
    };
  }

  // --- venues with their figures ---

  /** Every venue with what was put in, what it is worth now, and the difference. */
  async listVenues(userId: string) {
    const [venues, netByVenue, coinValues, adjustments, pending, user, rates] = await Promise.all([
      this.prisma.investingVenue.findMany({
        where: { userId },
        orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
      }),
      this.netTransferredUsdByVenue(userId),
      this.venues.manualCoinValues(userId),
      this.venues.adjustmentTotals(userId),
      this.pendingByVenue(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
    ]);

    const items = venues.map((venue) =>
      this.viewOf(venue, {
        transferredUsd: netByVenue.get(venue.id) ?? 0,
        coinsUsd: coinValues.get(venue.id) ?? null,
        adjustmentsUsd: adjustments.get(venue.id) ?? 0,
        pendingReview: pending.get(venue.id) ?? 0,
      }),
    );

    const baseCurrency = user?.currency ?? 'USD';
    const totalUsd = items.reduce((sum, i) => sum + (i.valueUsd ?? 0), 0);
    const openingUsd = items.reduce((sum, i) => sum + (i.openingUsd ?? 0), 0);
    const investedUsd = items.reduce((sum, i) => sum + i.transferredUsd + (i.openingUsd ?? 0), 0);

    return {
      items,
      baseCurrency,
      totalUsd: round2(totalUsd),
      // The same total in the user's own currency, for the cards that live outside this section.
      totalBase: this.toBase(totalUsd, baseCurrency, rates),
      investedUsd: round2(investedUsd),
      // Kept apart from the total it is half of: money that was already there when tracking began
      // was never "put in" by anyone here, and summing the two under that one word is what makes a
      // connected exchange claim you deposited its whole balance.
      openingUsd: round2(openingUsd),
      resultUsd: round2(totalUsd - investedUsd),
      // A venue whose value could not be read at all makes every total a lower bound.
      isPartial: items.some((i) => i.valueUsd === null),
      // Imported movements nobody has explained yet — the result is provisional until they are.
      pendingReview: items.reduce((sum, i) => sum + i.pendingReview, 0),
    };
  }

  /**
   * One venue in exactly the shape the list returns.
   *
   * Create and rename answer with this rather than the freshly written row: a row on its own
   * carries none of the figures a venue card is made of, so a client handed one gets something
   * that only looks like a venue.
   */
  async venueView(userId: string, venue: InvestingVenue) {
    const [netByVenue, coinValues, adjustments, pending] = await Promise.all([
      this.netTransferredUsdByVenue(userId),
      this.venues.manualCoinValues(userId),
      this.venues.adjustmentTotals(userId),
      this.pendingByVenue(userId),
    ]);

    return this.viewOf(venue, {
      transferredUsd: netByVenue.get(venue.id) ?? 0,
      coinsUsd: coinValues.get(venue.id) ?? null,
      adjustmentsUsd: adjustments.get(venue.id) ?? 0,
      pendingReview: pending.get(venue.id) ?? 0,
    });
  }

  /** A venue as the API shows it: the row plus the three figures that give it meaning. */
  private viewOf(
    venue: InvestingVenue,
    parts: {
      transferredUsd: number;
      coinsUsd: number | null;
      adjustmentsUsd: number;
      pendingReview: number;
    },
  ) {
    const transferred = round2(parts.transferredUsd);
    const value = this.venues.valueOf(venue, {
      coinsUsd: parts.coinsUsd,
      adjustmentsUsd: parts.adjustmentsUsd,
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
      // Both baselines together — to the user it is one figure: what was there when tracking began.
      openingUsd:
        venue.openingUsd === null && venue.openingFundUsd === null
          ? null
          : round2(Number(venue.openingUsd ?? 0) + Number(venue.openingFundUsd ?? 0)),
      openingAt: venue.openingAt,
      adjustmentsUsd: round2(parts.adjustmentsUsd),
      valueAt: venue.balanceAt,
      coins: this.venues.coinsOf(venue),
      fundUsd: venue.fundUsd === null ? null : Number(venue.fundUsd),
      pendingReview: parts.pendingReview,
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

  private async pendingByVenue(userId: string): Promise<Map<string, number>> {
    const grouped = await this.prisma.investingTransfer.groupBy({
      by: ['venueId'],
      where: { userId, needsReview: true },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.venueId, g._count._all]));
  }

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

    // Only the venue the coin leaves is checked, and only when it is kept by hand — a live exchange
    // knows its own holdings. A manual venue holds exactly what its records say: a coin it has none
    // of cannot leave it, or the transfer would be counted while the composition stayed unchanged.
    const source = input.direction === 'OUT' ? venue : await this.peerVenueOf(userId, input);
    if (source && source.mode === 'MANUAL') {
      const tracked = await this.venues.trackedAmount(userId, source.id, asset);
      if (tracked <= 0) {
        throw new BadRequestException(`${source.name} has no ${asset} on record.`);
      }
      if (amount > tracked + 1e-12) {
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
    // An imported row's own venue is the exchange that reported it, whose coins it reads itself —
    // shifting it would count the coin twice, and would still do so if the venue were later
    // disconnected and fell back to MANUAL.
    if (row.source === 'MANUAL') {
      await this.venues.applyCoinMove(userId, row.venue, row.asset, towardsVenue);
    }
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
      source: row.source,
      needsReview: row.needsReview,
      counterparty: row.counterparty,
      txId: row.txId,
    };
  }
}
