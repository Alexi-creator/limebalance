import type { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitApiError, BybitClient } from './bybit.client';
import { encryptSecret } from './crypto.util';
import { InvestingP2pService, P2P_UNAVAILABLE } from './investing-p2p.service';
import { InvestingTransfersService } from './investing-transfers.service';

const KEY = 'a'.repeat(64);
const DAY = 24 * 60 * 60 * 1000;
const CREDS = { apiKey: 'key', apiSecret: 'secret' };

const ACCOUNT = {
  id: 'acc1',
  userId: 'u1',
  exchange: 'bybit',
  status: 'ACTIVE',
  apiKey: encryptSecret('key', KEY),
  apiSecret: encryptSecret('secret', KEY),
  p2pSyncedAt: null as Date | null,
  p2pError: null as string | null,
  p2pAutoRecordFrom: null as Date | null,
};

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  side: 0,
  tokenId: 'USDT',
  amount: '50000',
  currencyId: 'RUB',
  price: '92.5',
  notifyTokenQuantity: '540.54',
  fee: '0',
  targetNickName: 'CryptoSeller',
  status: 50,
  createDate: '1758000000000',
  ...over,
});

const saved = (over: Record<string, unknown> = {}) => ({
  id: 'row1',
  userId: 'u1',
  accountId: 'acc1',
  orderId: 'o1',
  side: 'BUY',
  asset: 'USDT',
  quantity: 540.54,
  fiatAmount: 50000,
  fiatCurrency: 'RUB',
  price: 92.5,
  fee: 0,
  counterparty: 'CryptoSeller',
  status: 50,
  placedAt: new Date(1758000000000),
  ...over,
});

describe('InvestingP2pService', () => {
  let service: InvestingP2pService;
  let prisma: {
    exchangeAccount: { findMany: jest.Mock; update: jest.Mock };
    p2pOrder: { upsert: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    investingVenue: { findMany: jest.Mock; findUnique: jest.Mock };
    investingTransfer: { findMany: jest.Mock };
  };
  let bybit: { getP2pOrders: jest.Mock };
  let transfers: { recordP2pOrders: jest.Mock };

  beforeEach(async () => {
    prisma = {
      exchangeAccount: {
        findMany: jest.fn().mockResolvedValue([ACCOUNT]),
        update: jest.fn(),
      },
      p2pOrder: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([saved()]),
        count: jest.fn().mockResolvedValue(1),
      },
      investingVenue: {
        findMany: jest.fn().mockResolvedValue([{ id: 'v1', accountId: 'acc1' }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'v1' }),
      },
      investingTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    bybit = { getP2pOrders: jest.fn().mockResolvedValue({ count: 1, items: [order()] }) };
    transfers = { recordP2pOrders: jest.fn().mockResolvedValue(0) };

    const module = await Test.createTestingModule({
      providers: [
        InvestingP2pService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: ConfigService, useValue: { get: () => KEY } },
        { provide: InvestingTransfersService, useValue: transfers },
      ],
    }).compile();

    service = module.get(InvestingP2pService);
  });

  describe('sync', () => {
    it('reaches the whole 180 days Bybit keeps on the first run', async () => {
      await service.sync(ACCOUNT as never, CREDS);

      const { beginTime, endTime, size } = bybit.getP2pOrders.mock.calls[0][1];
      const span = Number(endTime) - Number(beginTime);
      expect(span).toBeLessThanOrEqual(180 * DAY);
      expect(span).toBeGreaterThan(179 * DAY);
      // Bybit's own page cap.
      expect(size).toBe(30);
    });

    it('re-reads a week behind the last run afterwards, so statuses catch up', async () => {
      const last = new Date(Date.now() - DAY);

      await service.sync({ ...ACCOUNT, p2pSyncedAt: last } as never, CREDS);

      expect(Number(bybit.getP2pOrders.mock.calls[0][1].beginTime)).toBe(last.getTime() - 7 * DAY);
    });

    it('saves every order, matched on its Bybit id so re-reads update in place', async () => {
      await service.sync(ACCOUNT as never, CREDS);

      const call = prisma.p2pOrder.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ userId_orderId: { userId: 'u1', orderId: 'o1' } });
      expect(call.create).toMatchObject({
        userId: 'u1',
        orderId: 'o1',
        accountId: 'acc1',
        side: 'BUY',
        asset: 'USDT',
        quantity: '540.54',
        fiatAmount: '50000',
        fiatCurrency: 'RUB',
        status: 50,
        placedAt: new Date(1758000000000),
      });
      expect(prisma.exchangeAccount.update.mock.calls[0][0].data).toMatchObject({
        p2pError: null,
      });
    });

    it('follows pages until the last one', async () => {
      const full = Array.from({ length: 30 }, (_, i) => order({ id: `a${i}` }));
      bybit.getP2pOrders
        .mockResolvedValueOnce({ count: 31, items: full })
        .mockResolvedValueOnce({ count: 31, items: [order({ id: 'last' })] });

      await service.sync(ACCOUNT as never, CREDS);

      expect(bybit.getP2pOrders.mock.calls.map((c) => c[1].page)).toEqual([1, 2]);
      expect(prisma.p2pOrder.upsert).toHaveBeenCalledTimes(31);
    });

    it('remembers why it failed, without marking the account synced', async () => {
      bybit.getP2pOrders.mockRejectedValue(new BybitApiError(10005, 'Permission denied'));

      await expect(service.sync(ACCOUNT as never, CREDS)).rejects.toThrow(BybitApiError);

      const data = prisma.exchangeAccount.update.mock.calls[0][0].data;
      expect(data.p2pError).toMatch(/^10005: /);
      expect(data.p2pSyncedAt).toBeUndefined();
    });
  });

  describe('auto-recording', () => {
    it('stays off until it is switched on', async () => {
      await service.sync(ACCOUNT as never, CREDS);

      expect(transfers.recordP2pOrders).not.toHaveBeenCalled();
    });

    it('records completed orders placed since it was switched on — and only those', async () => {
      const since = new Date('2026-09-21T00:00:00Z');
      prisma.p2pOrder.findMany.mockResolvedValue([
        saved({ placedAt: new Date('2026-09-21T10:00:00Z') }),
      ]);

      await service.sync({ ...ACCOUNT, p2pAutoRecordFrom: since } as never, CREDS);

      // Older orders were already accounted for some other way; recording them would take the
      // money out of the wallet twice.
      expect(prisma.p2pOrder.findMany.mock.calls[0][0].where).toEqual({
        accountId: 'acc1',
        status: 50,
        placedAt: { gte: since },
      });
      expect(transfers.recordP2pOrders).toHaveBeenCalledWith('u1', 'v1', [expect.anything()]);
    });
  });

  describe('syncIfDue', () => {
    it('leaves Bybit alone for half an hour after a read', async () => {
      await service.syncIfDue({ ...ACCOUNT, p2pSyncedAt: new Date() } as never, CREDS);

      expect(bybit.getP2pOrders).not.toHaveBeenCalled();
    });

    it('never throws — no P2P permission is a normal state', async () => {
      bybit.getP2pOrders.mockRejectedValue(new BybitApiError(10005, 'Permission denied'));

      await expect(service.syncIfDue(ACCOUNT as never, CREDS)).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('refreshes a stale copy, then shapes the saved rows for the table', async () => {
      const res = await service.list('u1', { page: 1, size: 20 });

      expect(bybit.getP2pOrders).toHaveBeenCalled();
      expect(res.items).toEqual([
        {
          id: 'o1',
          accountId: 'acc1',
          venueId: 'v1',
          side: 'BUY',
          asset: 'USDT',
          quantity: 540.54,
          fiatAmount: 50000,
          fiatCurrency: 'RUB',
          price: 92.5,
          fee: 0,
          counterparty: 'CryptoSeller',
          status: 'DONE',
          createdAt: new Date(1758000000000),
          transferId: null,
          autoRecorded: false,
        },
      ]);
      expect(res.syncError).toBeNull();
    });

    it('skips the refresh when the copy is only moments old', async () => {
      prisma.exchangeAccount.findMany.mockResolvedValue([{ ...ACCOUNT, p2pSyncedAt: new Date() }]);

      await service.list('u1');

      expect(bybit.getP2pOrders).not.toHaveBeenCalled();
    });

    it('keeps the history of a disconnected account, just with nowhere to record it', async () => {
      prisma.p2pOrder.findMany.mockResolvedValue([saved({ accountId: null })]);

      const { items } = await service.list('u1');

      expect(items[0]).toMatchObject({ accountId: null, venueId: null });
    });

    it('marks the orders already recorded as a transfer', async () => {
      prisma.investingTransfer.findMany.mockResolvedValue([{ id: 't7', externalId: 'p2p:o1' }]);

      const { items } = await service.list('u1');

      expect(items[0].transferId).toBe('t7');
    });

    it('folds Bybit statuses into the four that matter', async () => {
      prisma.p2pOrder.findMany.mockResolvedValue([
        saved({ orderId: 'a', status: 40, side: 'SELL' }),
        saved({ orderId: 'b', status: 80 }),
        saved({ orderId: 'c', status: 30 }),
        saved({ orderId: 'd', status: 20 }),
      ]);

      const { items } = await service.list('u1');

      expect(items.map((i) => i.status)).toEqual(['CANCELLED', 'CANCELLED', 'DISPUTE', 'ACTIVE']);
      expect(items[0].side).toBe('SELL');
    });

    it('still shows what is saved when the refresh fails, and says so', async () => {
      bybit.getP2pOrders.mockRejectedValue(new BybitApiError(10002, 'Timestamp expired'));

      const res = await service.list('u1');

      expect(res.items).toHaveLength(1);
      expect(res.syncError).toMatchObject({ code: P2P_UNAVAILABLE, retCode: 10002 });
    });

    it('is an error only when Bybit refuses and nothing is saved yet', async () => {
      bybit.getP2pOrders.mockRejectedValue(new BybitApiError(10005, 'Permission denied'));
      prisma.p2pOrder.findMany.mockResolvedValue([]);
      prisma.p2pOrder.count.mockResolvedValue(0);

      const err = (await service.list('u1').catch((e) => e)) as BadRequestException;

      expect(err.getStatus()).toBe(400);
      expect(err.getResponse()).toMatchObject({ code: P2P_UNAVAILABLE, retCode: 10005 });
    });

    it("refuses someone else's account", async () => {
      prisma.exchangeAccount.findMany.mockResolvedValue([]);

      await expect(service.list('u1', { accountId: 'acc2' })).rejects.toThrow(/not found/);
      expect(bybit.getP2pOrders).not.toHaveBeenCalled();
    });
  });
});
