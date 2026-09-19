import type { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient } from './bybit.client';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';

const ACCOUNT = {
  id: 'acc1',
  userId: 'u1',
  label: 'Bybit основной',
  exchange: 'bybit',
} as never;

const VENUE = {
  id: 'v1',
  userId: 'u1',
  accountId: 'acc1',
  name: 'Bybit основной',
  mode: 'LIVE' as const,
  balanceUsd: null,
  balanceAt: null,
  coins: null,
  openingUsd: null,
  openingAt: null,
  fundUsd: null,
  openingFundUsd: null,
  openingFundAt: null,
  movementsSyncedTo: null,
  archived: false,
  createdAt: new Date(),
};

const parts = (
  over: Partial<{ coinsUsd: number | null; adjustmentsUsd: number; transferredUsd: number }> = {},
) => ({
  coinsUsd: null,
  adjustmentsUsd: 0,
  transferredUsd: 0,
  ...over,
});

const WALLET = {
  totalEquity: '638.27105028',
  totalWalletBalance: '634.24752749',
  coin: [
    {
      coin: 'USDT',
      walletBalance: '500.1',
      usdValue: '500.10',
      equity: '500.1',
      unrealisedPnl: '0',
    },
    {
      coin: 'BTC',
      walletBalance: '0.002',
      usdValue: '138.17',
      equity: '0.002',
      unrealisedPnl: '0',
    },
    // Bybit lists every coin ever touched, including the ones long since sold.
    { coin: 'ADA', walletBalance: '0', usdValue: '0', equity: '0', unrealisedPnl: '0' },
    // …and occasionally one it cannot price.
    { coin: 'XYZ', walletBalance: '5', usdValue: '', equity: '5', unrealisedPnl: '0' },
  ],
};

describe('InvestingVenuesService', () => {
  let service: InvestingVenuesService;
  let prisma: {
    investingVenue: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    investingTransfer: { count: jest.Mock };
    holding: { findMany: jest.Mock; count: jest.Mock };
    investingAdjustment: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };
  let bybit: { getWalletBalance: jest.Mock; getFundBalance: jest.Mock };
  let prices: { getUsdPrices: jest.Mock; priceOf: jest.Mock };

  beforeEach(async () => {
    prisma = {
      investingVenue: {
        findUnique: jest.fn().mockResolvedValue(VENUE),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(VENUE),
        update: jest.fn(),
        delete: jest.fn(),
      },
      investingTransfer: { count: jest.fn().mockResolvedValue(0) },
      holding: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      investingAdjustment: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    bybit = {
      getWalletBalance: jest.fn().mockResolvedValue(WALLET),
      // A key without the Account Transfer permission — the state every existing key starts in.
      getFundBalance: jest
        .fn()
        .mockRejectedValue(new Error('Bybit error 10005: permission denied')),
    };
    prices = {
      getUsdPrices: jest.fn().mockResolvedValue(new Map([['BTC', 70_000]])),
      priceOf: jest.fn((asset: string, map: Map<string, number>) => map.get(asset) ?? null),
    };

    const module = await Test.createTestingModule({
      providers: [
        InvestingVenuesService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: PriceService, useValue: prices },
      ],
    }).compile();

    service = module.get(InvestingVenuesService);
  });

  describe('ensureForAccount', () => {
    it('creates the venue once and reuses it afterwards', async () => {
      prisma.investingVenue.findUnique.mockResolvedValueOnce(null);

      await service.ensureForAccount(ACCOUNT);
      await service.ensureForAccount(ACCOUNT);

      expect(prisma.investingVenue.create).toHaveBeenCalledTimes(1);
      expect(prisma.investingVenue.create).toHaveBeenCalledWith({
        data: { userId: 'u1', accountId: 'acc1', name: 'Bybit основной', mode: 'LIVE' },
      });
    });
  });

  describe('refreshLiveBalance', () => {
    it('stores the equity the exchange reports, with the priced coins it holds', async () => {
      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.balanceUsd).toBeCloseTo(638.27105028);
      // Zero balances dropped, biggest holding first.
      expect(data.coins).toEqual([
        { coin: 'USDT', amount: 500.1, usdValue: 500.1 },
        { coin: 'BTC', amount: 0.002, usdValue: 138.17 },
        { coin: 'XYZ', amount: 5, usdValue: null },
      ]);
    });

    it('writes the opening baseline on the first read', async () => {
      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.openingUsd).toBeCloseTo(638.27105028);
      expect(data.openingAt).toBeInstanceOf(Date);
    });

    it('never rewrites the opening baseline afterwards', async () => {
      prisma.investingVenue.findUnique.mockResolvedValue({ ...VENUE, openingUsd: 500 });

      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      // A baseline that moved with the balance would make every result zero, forever.
      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.openingUsd).toBeUndefined();
      expect(data.balanceUsd).toBeCloseTo(638.27105028);
    });

    it('leaves the last known figure alone when the exchange cannot be read', async () => {
      bybit.getWalletBalance.mockRejectedValue(new Error('Bybit error 10005: permission denied'));

      await expect(
        service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' }),
      ).resolves.toBeUndefined();
      // No write at all — a stale value with a visible timestamp beats a zero.
      expect(prisma.investingVenue.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshLiveBalance — FUND', () => {
    const FUND = [
      { coin: 'USDT', walletBalance: '100' },
      { coin: 'BTC', walletBalance: '0.001' },
      { coin: 'ETH', walletBalance: '0' },
    ];

    beforeEach(() => {
      bybit.getFundBalance.mockResolvedValue(FUND);
      prices.getUsdPrices.mockResolvedValue(
        new Map([
          ['BTC', 70_000],
          ['USDT', 1],
        ]),
      );
    });

    it('prices FUND itself and takes its own baseline on the first read', async () => {
      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.fundUsd).toBe(170);
      expect(data.openingFundUsd).toBe(170);
      expect(data.openingFundAt).toBeInstanceOf(Date);
      // Stored per account so either half can survive the other's failed read.
      expect(data.coins).toContainEqual({
        coin: 'BTC',
        amount: 0.001,
        usdValue: 70,
        source: 'FUND',
      });
      expect(data.coins).toContainEqual({ coin: 'BTC', amount: 0.002, usdValue: 138.17 });
    });

    it('never rewrites the FUND baseline afterwards', async () => {
      prisma.investingVenue.findUnique.mockResolvedValue({ ...VENUE, openingFundUsd: 20 });

      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.fundUsd).toBe(170);
      expect(data.openingFundUsd).toBeUndefined();
    });

    it('keeps the last FUND figure and coins when FUND cannot be read', async () => {
      bybit.getFundBalance.mockRejectedValue(new Error('network'));
      const kept = { coin: 'USDT', amount: 40, usdValue: 40, source: 'FUND' };
      prisma.investingVenue.findUnique.mockResolvedValue({ ...VENUE, fundUsd: 40, coins: [kept] });

      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.fundUsd).toBeUndefined();
      expect(data.coins).toContainEqual(kept);
    });

    it('skips FUND without a price feed rather than baking a zero into its baseline', async () => {
      prices.getUsdPrices.mockResolvedValue(null);

      await service.refreshLiveBalance(ACCOUNT, { apiKey: 'k', apiSecret: 's' });

      const data = prisma.investingVenue.update.mock.calls[0][0].data;
      expect(data.openingFundUsd).toBeUndefined();
      expect(data.fundUsd).toBeUndefined();
    });

    it('shows one row per coin across both accounts', () => {
      const venue = {
        ...VENUE,
        coins: [
          { coin: 'BTC', amount: 0.002, usdValue: 140 },
          { coin: 'USDT', amount: 100, usdValue: 100, source: 'FUND' },
          { coin: 'BTC', amount: 0.001, usdValue: 70, source: 'FUND' },
        ],
      } as never;

      expect(service.coinsOf(venue)).toEqual([
        { coin: 'BTC', amount: 0.003, usdValue: 210 },
        { coin: 'USDT', amount: 100, usdValue: 100 },
      ]);
    });

    it('counts FUND in the value and its baseline in the result', () => {
      const venue = {
        ...VENUE,
        balanceUsd: 600,
        fundUsd: 150,
        openingUsd: 500,
        openingFundUsd: 0,
      } as never;

      // 150 USDT arrived in FUND and was imported as a 150 transfer: value 750, result still 100.
      expect(service.valueOf(venue, parts())).toBe(750);
      expect(service.resultOf(venue, 750, 150)).toBe(100);
    });
  });

  describe('valueOf / resultOf', () => {
    it('values a live venue from the exchange, not from what was put in', () => {
      const venue = { ...VENUE, balanceUsd: 638.27 } as never;

      expect(service.valueOf(venue, parts({ transferredUsd: 1000 }))).toBe(638.27);
    });

    it('measures the result against the opening baseline, not against zero', () => {
      const venue = { ...VENUE, balanceUsd: 1500, openingUsd: 638.27 } as never;

      // Was 638.27 before tracking, 300 went in, now worth 1500 → made 561.73.
      expect(service.resultOf(venue, 1500, 300)).toBe(561.73);
    });

    it('has no result while the value is unknown', () => {
      expect(service.resultOf(VENUE as never, null, 300)).toBeNull();
    });

    it('values a manual venue at what was put into it, for now', () => {
      const venue = { ...VENUE, mode: 'MANUAL' as const, balanceUsd: null } as never;

      // Nothing described yet, so it is worth what was sent there.
      expect(service.valueOf(venue, parts({ transferredUsd: 250 }))).toBe(250);
    });
  });

  describe('manual venues', () => {
    it('refuses a second venue with the same name', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue(VENUE);

      await expect(service.createManual('u1', 'Ledger')).rejects.toThrow(
        'You already have a venue called "Ledger"',
      );
    });

    it('refuses to delete a venue that still has transfers', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });
      prisma.investingTransfer.count.mockResolvedValue(2);

      // Deleting them would hand the free balance money that never actually came back.
      await expect(service.remove('u1', 'v1')).rejects.toThrow(/2 transfer/);
      expect(prisma.investingVenue.delete).not.toHaveBeenCalled();
    });

    it("refuses to delete a connected exchange's venue", async () => {
      prisma.investingVenue.findFirst.mockResolvedValue(VENUE);

      await expect(service.remove('u1', 'v1')).rejects.toThrow(/disconnect the exchange/);
    });

    it('refuses to delete a venue that still tracks coins', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });
      prisma.holding.count.mockResolvedValue(2);

      // The coins would merely be unlinked: gone from every total, and out of the app's reach.
      await expect(service.remove('u1', 'v1')).rejects.toThrow(/2 tracked coin/);
      expect(prisma.investingVenue.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a venue whose value is all corrections', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });
      prisma.investingAdjustment.count.mockResolvedValue(1);

      // They cascade, so net worth would drop with no record left of why.
      await expect(service.remove('u1', 'v1')).rejects.toThrow(/1 correction/);
      expect(prisma.investingVenue.delete).not.toHaveBeenCalled();
    });

    it('names everything that is in the way, not just the first thing', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });
      prisma.investingTransfer.count.mockResolvedValue(3);
      prisma.holding.count.mockResolvedValue(2);
      prisma.investingAdjustment.count.mockResolvedValue(1);

      await expect(service.remove('u1', 'v1')).rejects.toThrow(
        /3 transfer\(s\), 2 tracked coin\(s\), 1 correction\(s\)/,
      );
    });

    it('sends the counts as data, so the client can say it in its own language', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });
      prisma.holding.count.mockResolvedValue(2);
      prisma.investingAdjustment.count.mockResolvedValue(1);

      const err = await service.remove('u1', 'v1').catch((e: BadRequestException) => e);

      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'VENUE_NOT_EMPTY',
        blockers: { transfers: 0, holdings: 2, adjustments: 1 },
      });
    });

    it('deletes an empty manual venue', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, accountId: null });

      await expect(service.remove('u1', 'v1')).resolves.toEqual({ success: true });
      expect(prisma.investingVenue.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    });
  });

  describe('manual valuation', () => {
    it('prices tracked coins instead of counting what was put in', async () => {
      prisma.holding.findMany.mockResolvedValue([
        { venueId: 'v1', asset: 'BTC', amount: 0.01 },
        // No ticker on Bybit → left out rather than counted as zero.
        { venueId: 'v1', asset: 'RARECOIN', amount: 100 },
      ]);

      const byVenue = await service.manualCoinValues('u1');

      expect(byVenue.get('v1')).toBe(700);
    });

    it('is worth what was sent while nothing is tracked yet', () => {
      const venue = { ...VENUE, mode: 'MANUAL' as const, balanceUsd: null } as never;

      // Zero here would read as "the money is gone", which is not what an undescribed wallet means.
      expect(service.valueOf(venue, parts({ coinsUsd: null, transferredUsd: 400 }))).toBe(400);
    });

    it('applies corrections on top of either basis', () => {
      const venue = { ...VENUE, mode: 'MANUAL' as const, balanceUsd: null } as never;

      expect(service.valueOf(venue, parts({ coinsUsd: 700, adjustmentsUsd: -200 }))).toBe(500);
      expect(
        service.valueOf(venue, parts({ coinsUsd: null, transferredUsd: 400, adjustmentsUsd: -50 })),
      ).toBe(350);
    });

    it('leaves a live venue untouched by coins and corrections', () => {
      const venue = { ...VENUE, balanceUsd: 638.27 } as never;

      // The exchange already counts its own coins; adding ours would double them.
      expect(service.valueOf(venue, parts({ coinsUsd: 999, adjustmentsUsd: 999 }))).toBe(638.27);
    });
  });

  describe('adjustments', () => {
    it('refuses a correction on a venue read from the exchange', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue(VENUE);

      await expect(
        service.addAdjustment('u1', 'v1', { amountUsd: -100, note: 'перевёл другу' }),
      ).rejects.toThrow(/overwritten on the next sync/);
    });

    it('refuses a correction with no reason', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, mode: 'MANUAL' });

      await expect(
        service.addAdjustment('u1', 'v1', { amountUsd: -100, note: '   ' }),
      ).rejects.toThrow('A correction needs a reason');
    });

    it('records a signed correction with its note', async () => {
      prisma.investingVenue.findFirst.mockResolvedValue({ ...VENUE, mode: 'MANUAL' });
      prisma.investingAdjustment.create.mockImplementation(({ data }: { data: object }) => ({
        id: 'a1',
        ...data,
      }));

      const row = await service.addAdjustment('u1', 'v1', {
        amountUsd: -200,
        note: '  перевёл другу  ',
      });

      expect(row).toMatchObject({ amountUsd: -200, note: 'перевёл другу', venueId: 'v1' });
    });
  });
});
