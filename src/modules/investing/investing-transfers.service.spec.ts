import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { FxRatesService } from '../currency/fx-rates.service';
import { InvestingTransfersService } from './investing-transfers.service';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';

const VENUE = {
  id: 'v1',
  userId: 'u1',
  accountId: 'acc1',
  name: 'Bybit',
  mode: 'LIVE' as const,
  balanceUsd: 638.27,
  balanceAt: new Date('2026-09-14T10:00:00Z'),
  coins: null,
  openingUsd: 500,
  openingAt: new Date('2026-09-01T00:00:00Z'),
  fundUsd: null,
  openingFundUsd: null,
  openingFundAt: null,
  movementsSyncedTo: null,
  archived: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

const WALLET_VENUE = {
  ...VENUE,
  id: 'v2',
  accountId: null,
  name: 'Ledger',
  mode: 'MANUAL' as const,
  balanceUsd: null,
  openingUsd: null,
  openingAt: null,
};

const ROW = {
  id: 't1',
  userId: 'u1',
  venueId: 'v1',
  direction: 'IN' as const,
  peer: 'LEDGER' as const,
  peerVenueId: null,
  amount: 300,
  currency: 'USD',
  amountUsd: 300,
  note: null,
  date: new Date('2026-09-13T00:00:00Z'),
  source: 'MANUAL' as const,
  externalId: null,
  counterparty: null,
  txId: null,
  needsReview: false,
  createdAt: new Date(),
  venue: { name: 'Bybit' },
  peerVenue: null,
};

const ledgerGroup = (currency: string, direction: 'IN' | 'OUT', amount: number) => ({
  currency,
  direction,
  _sum: { amount },
});
const venueGroup = (venueId: string, direction: 'IN' | 'OUT', amountUsd: number) => ({
  venueId,
  direction,
  _sum: { amountUsd },
});

describe('InvestingTransfersService', () => {
  let service: InvestingTransfersService;
  let prisma: {
    investingTransfer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    investingVenue: { findMany: jest.Mock; findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    holding: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    investingAdjustment: { groupBy: jest.Mock };
  };
  let currency: { getRates: jest.Mock; convertWithRates: jest.Mock };
  let fx: { convertOn: jest.Mock };
  let prices: { getUsdPrices: jest.Mock; priceOf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      investingTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(ROW),
        create: jest.fn().mockResolvedValue(ROW),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(ROW),
        update: jest.fn().mockResolvedValue(ROW),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      investingVenue: {
        findMany: jest.fn().mockResolvedValue([VENUE]),
        findFirst: jest.fn().mockResolvedValue(VENUE),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
      holding: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      investingAdjustment: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    currency = {
      getRates: jest.fn().mockResolvedValue({ THB: 32 }),
      convertWithRates: jest.fn((rates, amount, from, to) =>
        from === to
          ? amount
          : (amount / (from === 'USD' ? 1 : rates[from])) * (to === 'USD' ? 1 : rates[to]),
      ),
    };
    fx = { convertOn: jest.fn().mockResolvedValue(null) };
    prices = {
      getUsdPrices: jest.fn().mockResolvedValue(new Map([['BTCUSDT', 70_000]])),
      priceOf: jest.fn((asset: string, map: Map<string, number>) =>
        asset === 'USDT' ? 1 : (map.get(`${asset}USDT`) ?? null),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        InvestingTransfersService,
        InvestingVenuesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
        { provide: FxRatesService, useValue: fx },
        { provide: PriceService, useValue: prices },
      ],
    })
      .overrideProvider(InvestingVenuesService)
      .useValue(new InvestingVenuesService(prisma as never, {} as never, prices as never))
      .compile();

    service = module.get(InvestingTransfersService);
  });

  describe('create', () => {
    it('prices the transfer at the rate of its own day', async () => {
      fx.convertOn.mockResolvedValue(28.5);

      await service.create('u1', {
        venueId: 'v1',
        direction: 'IN',
        peer: 'LEDGER',
        amount: 1000,
        currency: 'THB',
        date: new Date('2026-09-13T00:00:00Z'),
      });

      expect(fx.convertOn).toHaveBeenCalledWith(1000, 'THB', 'USD', expect.any(Date));
      expect(prisma.investingTransfer.create.mock.calls[0][0].data.amountUsd).toBe(28.5);
    });

    it("falls back to today's rate when that day has none on record", async () => {
      await service.create('u1', {
        venueId: 'v1',
        direction: 'IN',
        peer: 'LEDGER',
        amount: 3200,
        currency: 'THB',
      });

      // 3200 THB at 32/USD.
      expect(prisma.investingTransfer.create.mock.calls[0][0].data.amountUsd).toBe(100);
    });

    it('still records the transfer when no rate exists at all', async () => {
      currency.getRates.mockResolvedValue(null);

      await service.create('u1', {
        venueId: 'v1',
        direction: 'IN',
        peer: 'LEDGER',
        amount: 1000,
        currency: 'THB',
      });

      // Refusing to save what actually happened would be worse than not pricing it yet.
      expect(prisma.investingTransfer.create.mock.calls[0][0].data.amountUsd).toBeNull();
    });

    it('refuses a negative amount — the sign belongs to the direction', async () => {
      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'LEDGER',
          amount: -100,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('needs the other venue when the money moves between two', async () => {
      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'VENUE',
          amount: 100,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a move from a venue to itself', async () => {
      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'VENUE',
          peerVenueId: 'v1',
          amount: 100,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a venue that isn't the user's", async () => {
      prisma.investingVenue.findFirst.mockResolvedValue(null);

      await expect(
        service.create('u1', {
          venueId: 'nope',
          direction: 'IN',
          peer: 'LEDGER',
          amount: 1,
          currency: 'USD',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create from a P2P order', () => {
    it('ties the transfer to the order', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue(null);

      await service.create('u1', {
        venueId: 'v1',
        direction: 'IN',
        peer: 'LEDGER',
        amount: 50_000,
        currency: 'THB',
        p2pOrderId: 'o1',
      });

      expect(prisma.investingTransfer.create.mock.calls[0][0].data.externalId).toBe('p2p:o1');
    });

    it('records one order only once', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue({ id: 't1' });

      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'IN',
          peer: 'LEDGER',
          amount: 50_000,
          currency: 'THB',
          p2pOrderId: 'o1',
        }),
      ).rejects.toThrow(/already recorded/);
      expect(prisma.investingTransfer.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('re-prices when the amount moves', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue({
        ...ROW,
        currency: 'THB',
        amount: 1000,
      });
      fx.convertOn.mockResolvedValue(50);

      await service.update('u1', 't1', { amount: 1750 });

      // Re-read at the transfer's own date, not at today's rate.
      expect(fx.convertOn).toHaveBeenCalledWith(1750, 'THB', 'USD', ROW.date);
      expect(prisma.investingTransfer.update.mock.calls[0][0].data.amountUsd).toBe(50);
    });

    it('leaves the stored USD figure alone when only the note changes', async () => {
      await service.update('u1', 't1', { note: 'на торговлю' });

      const data = prisma.investingTransfer.update.mock.calls[0][0].data;
      expect(data.amountUsd).toBeUndefined();
      expect(fx.convertOn).not.toHaveBeenCalled();
    });
  });

  describe('transferRows', () => {
    it('nets deposits against withdrawals, per currency', async () => {
      prisma.investingTransfer.groupBy.mockResolvedValue([
        ledgerGroup('USD', 'IN', 1000),
        ledgerGroup('USD', 'OUT', 1400),
        ledgerGroup('THB', 'IN', 5000),
      ]);

      await expect(service.transferRows('u1')).resolves.toEqual([
        // Took out 400 more than was ever put in — that is trading profit reaching the balance.
        { currency: 'USD', amount: -400 },
        { currency: 'THB', amount: 5000 },
      ]);
    });

    it('asks only for ledger transfers', async () => {
      await service.transferRows('u1');

      expect(prisma.investingTransfer.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', peer: 'LEDGER' } }),
      );
    });
  });

  describe('listVenues', () => {
    it('values a live venue from the exchange and measures the result from the baseline', async () => {
      prisma.investingTransfer.groupBy
        .mockResolvedValueOnce([venueGroup('v1', 'IN', 100)])
        .mockResolvedValueOnce([]);

      const { items, totalUsd, investedUsd, resultUsd } = await service.listVenues('u1');

      expect(items[0]).toMatchObject({ valueUsd: 638.27, transferredUsd: 100, openingUsd: 500 });
      // 638.27 now, 500 was already here, 100 went in → +38.27.
      expect(items[0].resultUsd).toBe(38.27);
      expect(totalUsd).toBe(638.27);
      expect(investedUsd).toBe(600);
      expect(resultUsd).toBe(38.27);
    });

    it('keeps what was already there apart from what was put in', async () => {
      // v1 opened at 500 and had 100 deposited; the wallet was made by hand and has neither. The
      // client needs the halves separately: calling 600 "put in" would claim the user deposited a
      // balance the exchange already had.
      prisma.investingVenue.findMany.mockResolvedValue([VENUE, WALLET_VENUE]);
      prisma.investingTransfer.groupBy
        .mockResolvedValueOnce([venueGroup('v1', 'IN', 100)])
        .mockResolvedValueOnce([]);

      const { openingUsd, investedUsd } = await service.listVenues('u1');

      expect(openingUsd).toBe(500);
      expect(investedUsd).toBe(600);
    });

    it('counts a venue-to-venue move on both sides from one row', async () => {
      prisma.investingVenue.findMany.mockResolvedValue([VENUE, WALLET_VENUE]);
      prisma.investingTransfer.groupBy
        // The row belongs to v1 and takes 200 out of it…
        .mockResolvedValueOnce([venueGroup('v1', 'OUT', 200)])
        // …which is exactly 200 into v2, read off the same row mirrored.
        .mockResolvedValueOnce([{ peerVenueId: 'v2', direction: 'OUT', _sum: { amountUsd: 200 } }]);

      const { items } = await service.listVenues('u1');

      expect(items[0].transferredUsd).toBe(-200);
      expect(items[1].transferredUsd).toBe(200);
      // A manual venue is worth what is in it, so moving money there is not a result.
      expect(items[1].valueUsd).toBe(200);
    });

    it('reads a holding brought in from outside as put in, not as profit', async () => {
      // A wallet whose only history is "this BTC was already mine": worth 700 today and 700 was
      // brought in, so nothing here was made by trading.
      prisma.investingVenue.findMany.mockResolvedValue([WALLET_VENUE]);
      prisma.investingTransfer.groupBy
        .mockResolvedValueOnce([venueGroup('v2', 'IN', 700)])
        .mockResolvedValueOnce([]);
      prisma.holding.findMany.mockResolvedValue([{ venueId: 'v2', asset: 'BTC', amount: 0.01 }]);

      const { items, investedUsd, resultUsd } = await service.listVenues('u1');

      expect(items[0]).toMatchObject({ valueUsd: 700, transferredUsd: 700 });
      expect(items[0].resultUsd).toBe(0);
      expect(investedUsd).toBe(700);
      expect(resultUsd).toBe(0);
    });

    it('flags the totals as partial while a venue cannot be valued', async () => {
      prisma.investingVenue.findMany.mockResolvedValue([{ ...VENUE, balanceUsd: null }]);

      const { isPartial, items } = await service.listVenues('u1');

      expect(items[0].valueUsd).toBeNull();
      expect(items[0].resultUsd).toBeNull();
      expect(isPartial).toBe(true);
    });
  });

  describe('venueView', () => {
    it('answers with a whole venue card, figures and all', async () => {
      const view = await service.venueView('u1', { ...WALLET_VENUE });

      // A freshly made wallet is empty rather than unknown: every figure is present, so the client
      // gets a venue it can render instead of a bare row it has to guess the rest of.
      expect(view).toEqual({
        id: 'v2',
        name: 'Ledger',
        accountId: null,
        mode: 'MANUAL',
        archived: false,
        transferredUsd: 0,
        valueUsd: 0,
        resultUsd: 0,
        openingUsd: null,
        openingAt: null,
        adjustmentsUsd: 0,
        valueAt: WALLET_VENUE.balanceAt,
        coins: [],
        fundUsd: null,
        pendingReview: 0,
      });
    });

    it('carries the money already moved into an existing venue', async () => {
      prisma.investingTransfer.groupBy
        .mockResolvedValueOnce([venueGroup('v2', 'IN', 250)])
        .mockResolvedValueOnce([]);

      const view = await service.venueView('u1', { ...WALLET_VENUE });

      expect(view).toMatchObject({ transferredUsd: 250, valueUsd: 250, resultUsd: 0 });
    });
  });

  describe('coin moves', () => {
    const coinRow = {
      ...ROW,
      direction: 'OUT' as const,
      peer: 'VENUE' as const,
      peerVenueId: 'v2',
      asset: 'BTC',
      assetAmount: 0.01,
      venue: WALLET_VENUE,
      peerVenue: { ...VENUE, id: 'v2' },
    };

    it('prices the move off the coin, not off a typed amount', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, mode: 'MANUAL' });
      prisma.investingTransfer.findUnique.mockResolvedValue(coinRow);
      prisma.holding.findMany.mockResolvedValue([{ amount: 0.05 }]);

      await service.create('u1', {
        venueId: 'v1',
        direction: 'OUT',
        peer: 'VENUE',
        peerVenueId: 'v2',
        asset: 'btc',
        assetAmount: 0.01,
      });

      const data = prisma.investingTransfer.create.mock.calls[0][0].data;
      // 0.01 BTC at 70 000 — and the currency is USD because no wallet was involved.
      expect(data).toMatchObject({ asset: 'BTC', assetAmount: 0.01, amount: 700, currency: 'USD' });
      expect(data.amountUsd).toBe(700);
    });

    it('takes the coin out of the source and puts it into the destination', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, mode: 'MANUAL' });
      prisma.investingTransfer.findUnique.mockResolvedValue(coinRow);
      prisma.holding.findFirst.mockResolvedValue({ id: 'h1', amount: 0.05 });
      prisma.holding.findMany.mockResolvedValue([{ amount: 0.05 }]);

      await service.create('u1', {
        venueId: 'v1',
        direction: 'OUT',
        peer: 'VENUE',
        peerVenueId: 'v2',
        asset: 'BTC',
        assetAmount: 0.01,
      });

      // Source is manual: 0.05 − 0.01. The destination in this fixture is LIVE, so it is skipped —
      // the exchange will report the arrival itself.
      expect(prisma.holding.update).toHaveBeenCalledWith({
        where: { id: 'h1' },
        data: { amount: 0.04 },
      });
    });

    it('puts the coins back when the transfer is deleted', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue(coinRow);
      prisma.investingTransfer.findUnique.mockResolvedValue(coinRow);
      prisma.holding.findFirst.mockResolvedValue({ id: 'h1', amount: 0.04 });

      await service.remove('u1', 't1');

      expect(prisma.holding.update).toHaveBeenCalledWith({
        where: { id: 'h1' },
        data: { amount: 0.05 },
      });
      expect(prisma.investingTransfer.delete).toHaveBeenCalled();
    });

    it('refuses to move more of a coin than the venue has on record', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({
        ...VENUE,
        mode: 'MANUAL',
        name: 'Ledger',
      });
      prisma.holding.findMany.mockResolvedValue([{ amount: 0.005 }]);

      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'VENUE',
          peerVenueId: 'v2',
          asset: 'BTC',
          assetAmount: 0.01,
        }),
      ).rejects.toThrow(/only has 0.005 BTC/);
    });

    it('refuses to move a coin the manual venue has none of', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({
        ...VENUE,
        mode: 'MANUAL',
        name: 'Ledger',
      });
      prisma.holding.findMany.mockResolvedValue([]);

      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'EXTERNAL',
          asset: 'BTC',
          assetAmount: 0.01,
        }),
      ).rejects.toThrow(/has no BTC on record/);
    });

    it('brings in a coin from outside without touching the free balance', async () => {
      // A holding that predates the app, or one somebody sent you: it arrives in the venue's
      // composition and is counted as put in, so the venue reads a result of zero rather than a
      // profit equal to its whole value.
      prisma.investingVenue.findFirst.mockResolvedValue(WALLET_VENUE);
      prisma.investingTransfer.findUnique.mockResolvedValue({
        ...coinRow,
        direction: 'IN',
        peer: 'EXTERNAL',
        peerVenueId: null,
        peerVenue: null,
      });
      prisma.holding.findFirst.mockResolvedValue(null);

      await service.create('u1', {
        venueId: 'v2',
        direction: 'IN',
        peer: 'EXTERNAL',
        asset: 'BTC',
        assetAmount: 0.01,
      });

      const data = prisma.investingTransfer.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ peer: 'EXTERNAL', direction: 'IN', asset: 'BTC', amount: 700 });
      // The coin lands in the wallet's tracked composition…
      expect(prisma.holding.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ asset: 'BTC', amount: 0.01 }) }),
      );
      // …priced at what it is worth, which is what the venue counts as put in — see the
      // listVenues case that turns this into a result of zero.
      expect(data.amountUsd).toBe(700);
    });

    it('refuses a coin moving to or from the wallet', async () => {
      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'LEDGER',
          asset: 'BTC',
          assetAmount: 0.01,
        }),
      ).rejects.toThrow(/cannot move to or from your balance/);
    });

    it('refuses a coin it cannot price', async () => {
      await expect(
        service.create('u1', {
          venueId: 'v1',
          direction: 'OUT',
          peer: 'EXTERNAL',
          asset: 'RARECOIN',
          assetAmount: 5,
        }),
      ).rejects.toThrow(/No price for RARECOIN/);
    });

    it('refuses to re-price a coin move by editing its amount', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue(coinRow);

      await expect(service.update('u1', 't1', { amount: 900 })).rejects.toThrow(
        /delete it and record a new one/,
      );
    });
  });

  describe('imported movements', () => {
    // 150 USDT someone sent to the exchange, as the import leaves it.
    const IMPORTED = {
      ...ROW,
      id: 't9',
      peer: 'EXTERNAL' as const,
      amount: 150,
      currency: 'USD',
      amountUsd: 150,
      asset: 'USDT',
      assetAmount: 150,
      source: 'BYBIT' as const,
      externalId: 'internal:1',
      counterparty: 'friend@mail.com',
      needsReview: true,
    };

    beforeEach(() => {
      prisma.investingTransfer.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 't9' ? IMPORTED : ROW),
      );
      prisma.investingTransfer.findUnique.mockResolvedValue({
        ...IMPORTED,
        venue: VENUE,
        peerVenue: null,
      });
    });

    it('takes the answer to the balance in the currency that really left it', async () => {
      await service.classify('u1', 't9', { peer: 'LEDGER', amount: 13_500, currency: 'THB' });

      const data = prisma.investingTransfer.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        peer: 'LEDGER',
        amount: 13_500,
        currency: 'THB',
        needsReview: false,
      });
      // What reached the exchange is a fact of the import — the result is measured against it.
      expect(data.amountUsd).toBeUndefined();
    });

    it('asks how much left the balance before calling it the balance', async () => {
      await expect(service.classify('u1', 't9', { peer: 'LEDGER' })).rejects.toThrow(
        /how much left or reached your balance/,
      );
      expect(prisma.investingTransfer.update).not.toHaveBeenCalled();
    });

    it('goes back to the imported USD figure when the answer stops being the balance', async () => {
      prisma.investingTransfer.findFirst.mockResolvedValue({
        ...IMPORTED,
        peer: 'LEDGER',
        amount: 13_500,
        currency: 'THB',
      });

      await service.classify('u1', 't9', { peer: 'EXTERNAL', note: 'от брата' });

      expect(prisma.investingTransfer.update.mock.calls[0][0].data).toMatchObject({
        peer: 'EXTERNAL',
        amount: 150,
        currency: 'USD',
        note: 'от брата',
        needsReview: false,
      });
    });

    it('never moves coins on the exchange that reported the movement itself', async () => {
      await service.classify('u1', 't9', { peer: 'EXTERNAL' });

      // The live venue reads its own coins; even a venue that later falls back to MANUAL must not
      // get them added a second time.
      expect(prisma.holding.create).not.toHaveBeenCalled();
      expect(prisma.holding.update).not.toHaveBeenCalled();
    });

    it('takes over a transfer already recorded by hand for the same movement', async () => {
      const manual = { ...ROW, id: 't2', amount: 13_500, currency: 'THB', note: 'на торговлю' };
      prisma.investingTransfer.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 't9' ? IMPORTED : manual),
      );

      await service.classify('u1', 't9', { peer: 'EXTERNAL', replacesId: 't2' });

      expect(prisma.investingTransfer.delete).toHaveBeenCalledWith({ where: { id: 't2' } });
      // The hand-written answer wins over the peer sent along with it.
      expect(prisma.investingTransfer.update.mock.calls[0][0].data).toMatchObject({
        peer: 'LEDGER',
        amount: 13_500,
        currency: 'THB',
        note: 'на торговлю',
        needsReview: false,
      });
    });

    it('refuses to merge a transfer going the other way', async () => {
      prisma.investingTransfer.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 't9' ? IMPORTED : { ...ROW, id: 't2', direction: 'OUT' }),
      );

      await expect(
        service.classify('u1', 't9', { peer: 'EXTERNAL', replacesId: 't2' }),
      ).rejects.toThrow(/same venue and in the same direction/);
      expect(prisma.investingTransfer.delete).not.toHaveBeenCalled();
    });

    it('classifies only imported transfers', async () => {
      await expect(service.classify('u1', 't1', { peer: 'EXTERNAL' })).rejects.toThrow(
        /edit this one instead/,
      );
    });

    it('refuses to delete one — the balance moved whether or not it is on record', async () => {
      await expect(service.remove('u1', 't9')).rejects.toThrow(/classify it instead/);
      expect(prisma.investingTransfer.delete).not.toHaveBeenCalled();
    });

    it('lets only the note of one be edited', async () => {
      await expect(service.update('u1', 't9', { amount: 10 })).rejects.toThrow(
        /only its note can be edited/,
      );
      await service.update('u1', 't9', { note: 'подарок' });
      expect(prisma.investingTransfer.update).toHaveBeenCalledTimes(1);
    });
  });
});
