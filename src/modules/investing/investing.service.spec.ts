import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient } from './bybit.client';
import { decryptSecret } from './crypto.util';
import { InvestingService } from './investing.service';
import { InvestingSyncService } from './investing-sync.service';
import { PriceService } from './price.service';

const KEY = 'd'.repeat(64);

describe('InvestingService', () => {
  let service: InvestingService;
  let prisma: {
    exchangeAccount: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    closedPosition: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    tradeExecution: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
    holding: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let bybit: { validateKey: jest.Mock };
  let sync: { syncAccount: jest.Mock; syncAccountById: jest.Mock };
  let prices: { getUsdPrices: jest.Mock; priceOf: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    prisma = {
      exchangeAccount: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      closedPosition: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tradeExecution: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
      holding: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    bybit = { validateKey: jest.fn().mockResolvedValue({ readOnly: true }) };
    sync = { syncAccount: jest.fn(), syncAccountById: jest.fn().mockResolvedValue(undefined) };
    prices = { getUsdPrices: jest.fn(), priceOf: jest.fn() };
    configGet = jest.fn().mockReturnValue(KEY);

    const module = await Test.createTestingModule({
      providers: [
        InvestingService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: InvestingSyncService, useValue: sync },
        { provide: PriceService, useValue: prices },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(InvestingService);
  });

  describe('addAccount', () => {
    const dto = { apiKey: 'plain-key', apiSecret: 'plain-secret', label: 'Main account' };

    it('validates the key, stores it encrypted and backfills as far back as Bybit allows', async () => {
      prisma.exchangeAccount.create.mockImplementation(({ data }: { data: never }) =>
        Promise.resolve({ id: 'acc-1', ...(data as object) }),
      );

      const before = Date.now();
      const result = await service.addAccount('u1', dto);
      const after = Date.now();

      expect(bybit.validateKey).toHaveBeenCalledWith({
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
      });
      const { data } = prisma.exchangeAccount.create.mock.calls[0][0];
      // ~729 days back from "now" — not tied to the user's registration date anymore, and just
      // under Bybit's 2-year hard limit on startTime.
      const MAX_HISTORY_MS = 729 * 24 * 60 * 60 * 1000;
      expect(data.syncFrom.getTime()).toBeGreaterThanOrEqual(before - MAX_HISTORY_MS);
      expect(data.syncFrom.getTime()).toBeLessThanOrEqual(after - MAX_HISTORY_MS);
      expect(data.label).toBe('Main account');
      // Stored encrypted, not in plaintext — but decryptable with the master key.
      expect(data.apiKey).not.toContain('plain-key');
      expect(decryptSecret(data.apiKey, KEY)).toBe('plain-key');
      expect(decryptSecret(data.apiSecret, KEY)).toBe('plain-secret');
      // The initial backfill is kicked off in the background.
      expect(sync.syncAccountById).toHaveBeenCalledWith('acc-1');
      // The response exposes a mask and the readOnly flag, never the secret.
      expect(result.readOnly).toBe(true);
      expect(result.apiKeyMasked).toBe('••••-key');
      expect(result).not.toHaveProperty('apiSecret');
    });

    it('rejects a key Bybit does not accept', async () => {
      bybit.validateKey.mockRejectedValue(new Error('invalid key'));
      await expect(service.addAccount('u1', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.exchangeAccount.create).not.toHaveBeenCalled();
    });

    it('rejects a valid key that is not read-only', async () => {
      bybit.validateKey.mockResolvedValue({ readOnly: false });
      await expect(service.addAccount('u1', dto)).rejects.toThrow(/read-only/);
      expect(prisma.exchangeAccount.create).not.toHaveBeenCalled();
    });

    it('fails clearly when ENCRYPTION_KEY is not configured', async () => {
      configGet.mockReturnValue(undefined);
      await expect(service.addAccount('u1', dto)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('removeAccount', () => {
    it('deletes an owned account', async () => {
      prisma.exchangeAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      await expect(service.removeAccount('u1', 'acc-1')).resolves.toEqual({ deleted: true });
      expect(prisma.exchangeAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    });

    it('404s on a foreign or missing account', async () => {
      prisma.exchangeAccount.findFirst.mockResolvedValue(null);
      await expect(service.removeAccount('u1', 'other')).rejects.toThrow(NotFoundException);
      expect(prisma.exchangeAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe('renameAccount', () => {
    it('updates the label of an owned account', async () => {
      prisma.exchangeAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
      prisma.exchangeAccount.update.mockResolvedValue({
        id: 'acc-1',
        exchange: 'bybit',
        label: 'Futures acc',
        apiKey: 'irrelevant-here',
      });

      const result = await service.renameAccount('u1', 'acc-1', { label: 'Futures acc' });

      expect(prisma.exchangeAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { label: 'Futures acc' },
      });
      expect(result.label).toBe('Futures acc');
    });

    it('404s on a foreign or missing account', async () => {
      prisma.exchangeAccount.findFirst.mockResolvedValue(null);
      await expect(
        service.renameAccount('u1', 'other', { label: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.exchangeAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('getPositions', () => {
    it('filters by symbol (uppercased) and date range, returns items with total', async () => {
      prisma.closedPosition.findMany.mockResolvedValue([
        { id: 'p1', source: 'manual', accountId: null, qty: 1, avgEntryPrice: 65000, leverage: null },
      ]);
      prisma.closedPosition.count.mockResolvedValue(42);
      const from = new Date('2026-07-01');

      const result = await service.getPositions('u1', { symbol: 'btcusdt', from, limit: 10 });

      expect(prisma.closedPosition.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', symbol: 'BTCUSDT', closedAt: { gte: from, lte: undefined } },
        orderBy: { closedAt: 'desc' },
        take: 10,
        skip: 0,
      });
      // Manual entries have no leverage (→ 1x) and no fee lookup (no accountId/openedAt).
      expect(result.total).toBe(42);
      expect(result.items[0]).toMatchObject({ id: 'p1', entryVolumeUsd: 65000, totalFeeUsd: null });
    });

    it('divides entry volume by leverage and sums fees over the position window for synced trades', async () => {
      const openedAt = new Date('2026-07-01T00:00:00Z');
      const closedAt = new Date('2026-07-02T00:00:00Z');
      prisma.closedPosition.findMany.mockResolvedValue([
        {
          id: 'p1',
          source: 'bybit',
          accountId: 'acc-1',
          symbol: 'BTCUSDT',
          category: 'linear',
          qty: 1,
          avgEntryPrice: 65000,
          leverage: 10,
          openedAt,
          closedAt,
        },
      ]);
      prisma.closedPosition.count.mockResolvedValue(1);
      prisma.tradeExecution.aggregate.mockResolvedValue({ _sum: { fee: -12.345 } });

      const result = await service.getPositions('u1', {});

      expect(prisma.tradeExecution.aggregate).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', symbol: 'BTCUSDT', category: 'linear', execTime: { gte: openedAt, lte: closedAt } },
        _sum: { fee: true },
      });
      expect(result.items[0]).toMatchObject({ entryVolumeUsd: 6500, totalFeeUsd: -12.34 });
    });

    it('leaves totalFeeUsd null for a synced position with no known open time', async () => {
      prisma.closedPosition.findMany.mockResolvedValue([
        {
          id: 'p1',
          source: 'bybit',
          accountId: 'acc-1',
          symbol: 'BTCUSDT',
          category: 'linear',
          qty: 1,
          avgEntryPrice: 65000,
          leverage: 10,
          openedAt: null,
          closedAt: new Date(),
        },
      ]);
      prisma.closedPosition.count.mockResolvedValue(1);

      const result = await service.getPositions('u1', {});

      expect(prisma.tradeExecution.aggregate).not.toHaveBeenCalled();
      expect(result.items[0].totalFeeUsd).toBeNull();
    });

    it('caps the page size', async () => {
      prisma.closedPosition.findMany.mockResolvedValue([]);
      prisma.closedPosition.count.mockResolvedValue(0);

      await service.getPositions('u1', { limit: 10_000 });

      expect(prisma.closedPosition.findMany.mock.calls[0][0].take).toBe(200);
    });
  });

  describe('getTrades', () => {
    it('excludes funding settlements from items/total and rolls them into a separate summary', async () => {
      prisma.tradeExecution.findMany.mockResolvedValue([{ id: 't1' }]);
      prisma.tradeExecution.count.mockResolvedValue(3);
      prisma.tradeExecution.aggregate.mockResolvedValue({ _sum: { fee: -0.42 }, _count: 27 });

      const result = await service.getTrades('u1', { symbol: 'BTCUSDT' });

      expect(prisma.tradeExecution.findMany.mock.calls[0][0].where).toMatchObject({
        execType: { not: 'Funding' },
      });
      expect(prisma.tradeExecution.count.mock.calls[0][0].where).toMatchObject({
        execType: { not: 'Funding' },
      });
      expect(prisma.tradeExecution.aggregate).toHaveBeenCalledWith({
        where: expect.objectContaining({ execType: 'Funding' }),
        _sum: { fee: true },
        _count: true,
      });
      expect(result).toEqual({
        items: [{ id: 't1' }],
        total: 3,
        funding: { totalFee: -0.42, count: 27 },
      });
    });

    it('defaults funding.totalFee to 0 when there are no funding rows', async () => {
      prisma.tradeExecution.findMany.mockResolvedValue([]);
      prisma.tradeExecution.count.mockResolvedValue(0);
      prisma.tradeExecution.aggregate.mockResolvedValue({ _sum: { fee: null }, _count: 0 });

      const result = await service.getTrades('u1', {});

      expect(result.funding).toEqual({ totalFee: 0, count: 0 });
    });
  });

  describe('manual positions', () => {
    it('creates a long with computed PnL and the exchange side convention', async () => {
      prisma.closedPosition.create.mockResolvedValue({ id: 'p1' });

      await service.addManualPosition('u1', {
        symbol: 'btcusdt',
        direction: 'long',
        qty: 0.5,
        entryPrice: 64000,
        exitPrice: 65200,
        closedAt: new Date('2026-07-12T15:30:00Z'),
        venue: 'MEXC',
      });

      const { data } = prisma.closedPosition.create.mock.calls[0][0];
      expect(data).toMatchObject({
        userId: 'u1',
        source: 'manual',
        symbol: 'BTCUSDT',
        side: 'Sell', // a long is closed by a Sell — same convention as synced rows
        closedPnl: 600, // (65200 - 64000) * 0.5
        raw: { venue: 'MEXC' },
      });
    });

    it('computes short PnL with the inverted sign and prefers an explicit value', async () => {
      prisma.closedPosition.create.mockResolvedValue({});

      await service.addManualPosition('u1', {
        symbol: 'ETHUSDT',
        direction: 'short',
        qty: 2,
        entryPrice: 3500,
        exitPrice: 3400,
        closedAt: new Date(),
      });
      expect(prisma.closedPosition.create.mock.calls[0][0].data.closedPnl).toBe(200);

      await service.addManualPosition('u1', {
        symbol: 'ETHUSDT',
        direction: 'short',
        qty: 2,
        entryPrice: 3500,
        exitPrice: 3400,
        closedPnl: 185.5, // fees accounted by the user
        closedAt: new Date(),
      });
      expect(prisma.closedPosition.create.mock.calls[1][0].data.closedPnl).toBe(185.5);
    });

    it('recomputes PnL on update only when trade inputs change', async () => {
      prisma.closedPosition.findFirst.mockResolvedValue({
        id: 'p1',
        source: 'manual',
        side: 'Sell',
        qty: 1,
        avgEntryPrice: 100,
        avgExitPrice: 110,
      });
      prisma.closedPosition.update.mockResolvedValue({});

      // Date-only edit: the stored (possibly hand-adjusted) PnL must survive.
      await service.updateManualPosition('u1', 'p1', { closedAt: new Date() });
      expect(prisma.closedPosition.update.mock.calls[0][0].data).not.toHaveProperty('closedPnl');

      // Price edit: PnL follows.
      await service.updateManualPosition('u1', 'p1', { exitPrice: 130 });
      expect(prisma.closedPosition.update.mock.calls[1][0].data.closedPnl).toBe(30);
    });

    it('refuses to edit or delete synced positions', async () => {
      prisma.closedPosition.findFirst.mockResolvedValue({ id: 'p1', source: 'bybit' });

      await expect(service.updateManualPosition('u1', 'p1', { qty: 1 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.removeManualPosition('u1', 'p1')).rejects.toThrow(BadRequestException);
      expect(prisma.closedPosition.delete).not.toHaveBeenCalled();
    });

    it('404s on a foreign position', async () => {
      prisma.closedPosition.findFirst.mockResolvedValue(null);
      await expect(service.removeManualPosition('u1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('holdings', () => {
    it('stores the asset uppercased', async () => {
      prisma.holding.create.mockResolvedValue({});
      await service.addHolding('u1', { asset: 'btc', amount: 0.5, avgBuyPrice: 60000 });
      expect(prisma.holding.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u1',
        asset: 'BTC',
      });
    });

    it('values holdings at current prices with unrealized PnL and a total', async () => {
      prisma.holding.findMany.mockResolvedValue([
        { id: 'h1', asset: 'BTC', amount: 0.5, avgBuyPrice: 60000 },
        { id: 'h2', asset: 'OBSCURE', amount: 100, avgBuyPrice: 1 },
        { id: 'h3', asset: 'USDT', amount: 1000, avgBuyPrice: null },
      ]);
      const priceMap = new Map<string, number>();
      prices.getUsdPrices.mockResolvedValue(priceMap);
      prices.priceOf.mockImplementation((asset: string) =>
        asset === 'BTC' ? 70000 : asset === 'USDT' ? 1 : null,
      );

      const result = await service.listHoldings('u1');

      const [btc, obscure, usdt] = result.items;
      expect(btc).toMatchObject({ value: 35000, pnlUsd: 5000, pnlPct: 16.67 });
      // No ticker → no valuation, but the row is still returned.
      expect(obscure).toMatchObject({ price: null, value: null, pnlUsd: null });
      // No avgBuyPrice → value without PnL.
      expect(usdt).toMatchObject({ value: 1000, pnlUsd: null, pnlPct: null });
      expect(result.totalValue).toBe(36000);
    });

    it('survives prices being unavailable', async () => {
      prisma.holding.findMany.mockResolvedValue([
        { id: 'h1', asset: 'BTC', amount: 1, avgBuyPrice: 60000 },
      ]);
      prices.getUsdPrices.mockResolvedValue(null);

      const result = await service.listHoldings('u1');

      expect(result.items[0]).toMatchObject({ price: null, value: null });
      expect(result.totalValue).toBe(0);
    });

    it('404s on updating or deleting a foreign holding', async () => {
      prisma.holding.findFirst.mockResolvedValue(null);
      await expect(service.updateHolding('u1', 'x', { amount: 1 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeHolding('u1', 'x')).rejects.toThrow(NotFoundException);
      expect(prisma.holding.delete).not.toHaveBeenCalled();
    });
  });
});
