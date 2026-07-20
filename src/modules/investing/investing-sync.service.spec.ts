import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { ExchangeAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient } from './bybit.client';
import { encryptSecret } from './crypto.util';
import { InvestingSyncService } from './investing-sync.service';

const KEY = 'c'.repeat(64);
const DAY = 24 * 60 * 60 * 1000;

const makeAccount = (over: Partial<ExchangeAccount> = {}): ExchangeAccount =>
  ({
    id: 'acc-1',
    userId: 'u1',
    exchange: 'bybit',
    label: '',
    apiKey: encryptSecret('k', KEY),
    apiSecret: encryptSecret('s', KEY),
    status: 'ACTIVE',
    lastError: null,
    syncFrom: new Date(Date.now() - 10 * DAY),
    closedPnlSyncedTo: null,
    executionsSyncedTo: null,
    lastSyncAt: null,
    createdAt: new Date(),
    ...over,
  }) as ExchangeAccount;

const execRecord = (over: Record<string, string> = {}) => ({
  execId: 'e1',
  orderId: 'o1',
  symbol: 'BTCUSDT',
  side: 'Sell',
  execType: 'Trade',
  execPrice: '65000',
  execQty: '0.09',
  execFee: '0.18',
  feeCurrency: 'USDT',
  execTime: '1750000000000',
  ...over,
});

const pnlRecord = (over: Record<string, string> = {}) => ({
  orderId: 'o1',
  symbol: 'BTCUSDT',
  side: 'Sell',
  qty: '0.5',
  avgEntryPrice: '64000',
  avgExitPrice: '65000',
  closedPnl: '500',
  leverage: '10',
  createdTime: '1750000000000',
  updatedTime: '1750000000000',
  ...over,
});

describe('InvestingSyncService', () => {
  let service: InvestingSyncService;
  let prisma: {
    exchangeAccount: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    closedPosition: { upsert: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    tradeExecution: { upsert: jest.Mock; findMany: jest.Mock };
  };
  let bybit: { getClosedPnl: jest.Mock; getExecutions: jest.Mock };

  beforeEach(async () => {
    prisma = {
      exchangeAccount: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      closedPosition: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      tradeExecution: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    bybit = {
      getClosedPnl: jest.fn().mockResolvedValue({ list: [], nextPageCursor: '' }),
      getExecutions: jest.fn().mockResolvedValue({ list: [], nextPageCursor: '' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        InvestingSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(KEY) } },
      ],
    }).compile();

    service = module.get(InvestingSyncService);
  });

  it('walks the range from syncFrom in windows of at most 7 days', async () => {
    await service.syncAccount(makeAccount());

    // 10 days of history → 2 windows (7d + 3d); executions run per category (linear + spot).
    expect(bybit.getClosedPnl).toHaveBeenCalledTimes(2);
    expect(bybit.getExecutions).toHaveBeenCalledTimes(4);
    expect(new Set(bybit.getExecutions.mock.calls.map(([, p]) => p.category))).toEqual(
      new Set(['linear', 'spot']),
    );
    const first = bybit.getClosedPnl.mock.calls[0][1];
    const second = bybit.getClosedPnl.mock.calls[1][1];
    expect(second.startTime).toBe(first.endTime);
    expect(first.endTime - first.startTime).toBe(7 * DAY);
    // Decrypted creds are passed to the client.
    expect(bybit.getClosedPnl.mock.calls[0][0]).toEqual({ apiKey: 'k', apiSecret: 's' });
  });

  it('resumes from the stored cursor instead of re-reading all history', async () => {
    const syncedTo = new Date(Date.now() - DAY);
    await service.syncAccount(makeAccount({ closedPnlSyncedTo: syncedTo }));

    expect(bybit.getClosedPnl).toHaveBeenCalledTimes(1);
    const { startTime } = bybit.getClosedPnl.mock.calls[0][1];
    // Just behind the cursor (1 min overlap for boundary records).
    expect(startTime).toBe(syncedTo.getTime() - 60_000);
  });

  it('upserts closed positions by (accountId, orderId) and advances the cursor', async () => {
    bybit.getClosedPnl
      .mockResolvedValueOnce({ list: [pnlRecord()], nextPageCursor: '' })
      .mockResolvedValue({ list: [], nextPageCursor: '' });

    await service.syncAccount(makeAccount());

    expect(prisma.closedPosition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_orderId: { accountId: 'acc-1', orderId: 'o1' } },
        create: expect.objectContaining({ symbol: 'BTCUSDT', closedPnl: '500', userId: 'u1' }),
      }),
    );
    const cursorUpdates = prisma.exchangeAccount.update.mock.calls.filter(
      ([arg]) => arg.data.closedPnlSyncedTo,
    );
    expect(cursorUpdates).toHaveLength(2); // one per finished window
  });

  it('follows nextPageCursor within a window', async () => {
    bybit.getClosedPnl
      .mockResolvedValueOnce({ list: [pnlRecord()], nextPageCursor: 'page2' })
      .mockResolvedValueOnce({ list: [pnlRecord({ orderId: 'o2' })], nextPageCursor: '' })
      .mockResolvedValue({ list: [], nextPageCursor: '' });

    await service.syncAccount(makeAccount({ syncFrom: new Date(Date.now() - DAY) }));

    expect(bybit.getClosedPnl).toHaveBeenCalledTimes(2);
    expect(bybit.getClosedPnl.mock.calls[1][1].cursor).toBe('page2');
    expect(prisma.closedPosition.upsert).toHaveBeenCalledTimes(2);
  });

  it('stores execType from the exchange record, defaulting to Trade when absent', async () => {
    bybit.getExecutions
      .mockResolvedValueOnce({ list: [execRecord({ execType: 'Funding' })], nextPageCursor: '' })
      .mockResolvedValue({ list: [], nextPageCursor: '' });

    await service.syncAccount(makeAccount());

    expect(prisma.tradeExecution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ execType: 'Funding' }),
        update: expect.objectContaining({ execType: 'Funding' }),
      }),
    );

    prisma.tradeExecution.upsert.mockClear();
    bybit.getExecutions
      .mockReset()
      .mockResolvedValueOnce({
        list: [execRecord({ execId: 'e2', execType: '' })],
        nextPageCursor: '',
      })
      .mockResolvedValue({ list: [], nextPageCursor: '' });

    await service.syncAccount(makeAccount());

    expect(prisma.tradeExecution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ execType: 'Trade' }) }),
    );
  });

  it('derives and stores openedAt for linear positions from opening fills after the sync', async () => {
    const openFill = {
      symbol: 'BTCUSDT',
      side: 'Buy',
      qty: 1,
      execTime: new Date('2026-07-01T00:00:00Z'),
      raw: { closedSize: '0' },
    };
    const closedPos = {
      id: 'pos-1',
      symbol: 'BTCUSDT',
      side: 'Sell',
      qty: 1,
      closedAt: new Date('2026-07-02T00:00:00Z'),
    };
    // The same tradeExecution.findMany mock backs both rebuildSpotPositions (category: 'spot')
    // and rebuildLinearOpenedAt (category: 'linear') — branch on the query to keep them apart.
    prisma.tradeExecution.findMany.mockImplementation(
      ({ where }: { where: { category: string } }) =>
        Promise.resolve(where.category === 'linear' ? [openFill] : []),
    );
    prisma.closedPosition.findMany.mockResolvedValue([closedPos]);

    await service.syncAccount(makeAccount());

    expect(prisma.closedPosition.update).toHaveBeenCalledWith({
      where: { id: 'pos-1' },
      data: { openedAt: openFill.execTime },
    });
  });

  it('skips the linear openedAt rebuild when there are no fills or no linear positions', async () => {
    prisma.tradeExecution.findMany.mockResolvedValue([]);
    prisma.closedPosition.findMany.mockResolvedValue([]);

    await service.syncAccount(makeAccount());

    expect(prisma.closedPosition.update).not.toHaveBeenCalled();
  });

  it('derives closed spot trades from the stored fills (FIFO) after the sync', async () => {
    const buy = {
      execId: 'b1',
      symbol: 'BTCUSDT',
      side: 'Buy',
      price: 100,
      qty: 1,
      fee: 0,
      feeCurrency: null,
      execTime: new Date('2026-07-01T00:00:00Z'),
    };
    const sell = {
      ...buy,
      execId: 's1',
      side: 'Sell',
      price: 150,
      execTime: new Date('2026-07-02T00:00:00Z'),
    };
    prisma.tradeExecution.findMany.mockResolvedValue([buy, sell]);

    await service.syncAccount(makeAccount());

    expect(prisma.tradeExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1', category: 'spot' } }),
    );
    expect(prisma.closedPosition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId_orderId: { accountId: 'acc-1', orderId: 'spot:s1' } },
        create: expect.objectContaining({
          category: 'spot',
          side: 'Sell',
          closedPnl: 50,
          openedAt: buy.execTime,
          closedAt: sell.execTime,
        }),
      }),
    );
  });

  it('marks the account ERROR with the reason when the sync fails, and rethrows', async () => {
    bybit.getClosedPnl.mockRejectedValue(new Error('rate limited'));

    await expect(service.syncAccount(makeAccount())).rejects.toThrow('rate limited');
    expect(prisma.exchangeAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { status: 'ERROR', lastError: expect.stringContaining('rate limited') },
    });
  });

  it('marks the account healthy after a successful sync', async () => {
    await service.syncAccount(makeAccount({ status: 'ERROR', lastError: 'old error' }));

    expect(prisma.exchangeAccount.update).toHaveBeenLastCalledWith({
      where: { id: 'acc-1' },
      data: { lastSyncAt: expect.any(Date), status: 'ACTIVE', lastError: null },
    });
  });

  it('skips everything when ENCRYPTION_KEY is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        InvestingSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    await module.get(InvestingSyncService).syncAll();
    expect(prisma.exchangeAccount.findMany).not.toHaveBeenCalled();
  });
});
