import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient } from './bybit.client';
import { InvestingMovementsService } from './investing-movements.service';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';

const ACCOUNT = { id: 'acc1', userId: 'u1' } as never;
const CREDS = { apiKey: 'k', apiSecret: 's' };
const DAY = 24 * 60 * 60 * 1000;

const empty = { rows: [], nextPageCursor: '' };
const page = <T>(rows: T[], nextPageCursor = '') => ({ rows, nextPageCursor });

describe('InvestingMovementsService', () => {
  let service: InvestingMovementsService;
  let prisma: {
    investingTransfer: { createMany: jest.Mock };
    investingVenue: { update: jest.Mock };
  };
  let bybit: { getDeposits: jest.Mock; getInternalDeposits: jest.Mock; getWithdrawals: jest.Mock };
  let venues: { ensureForAccount: jest.Mock };
  let fundSince: Date;

  beforeEach(async () => {
    fundSince = new Date(Date.now() - 2 * DAY);
    prisma = {
      investingTransfer: { createMany: jest.fn() },
      investingVenue: { update: jest.fn() },
    };
    bybit = {
      getDeposits: jest.fn().mockResolvedValue(empty),
      getInternalDeposits: jest.fn().mockResolvedValue(empty),
      getWithdrawals: jest.fn().mockResolvedValue(empty),
    };
    venues = {
      ensureForAccount: jest
        .fn()
        .mockResolvedValue({ id: 'v1', openingFundAt: fundSince, movementsSyncedTo: null }),
    };

    const module = await Test.createTestingModule({
      providers: [
        InvestingMovementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BybitClient, useValue: bybit },
        { provide: InvestingVenuesService, useValue: venues },
        {
          provide: PriceService,
          useValue: {
            getUsdPrices: jest.fn().mockResolvedValue(new Map([['BTCUSDT', 70_000]])),
            priceOf: (asset: string, map: Map<string, number>) =>
              asset === 'USDT' ? 1 : (map.get(`${asset}USDT`) ?? null),
          },
        },
      ],
    }).compile();

    service = module.get(InvestingMovementsService);
  });

  const imported = () => prisma.investingTransfer.createMany.mock.calls.flatMap((c) => c[0].data);

  it('stays off until FUND has a baseline', async () => {
    venues.ensureForAccount.mockResolvedValue({ id: 'v1', openingFundAt: null });

    await service.sync(ACCOUNT, CREDS);

    // Deposits land in FUND: importing them while FUND is unread would count money the venue's
    // value does not show yet, and turn every gift into a loss instead of a profit.
    expect(bybit.getDeposits).not.toHaveBeenCalled();
    expect(prisma.investingTransfer.createMany).not.toHaveBeenCalled();
  });

  it('imports a transfer from another Bybit user with who sent it, pending review', async () => {
    const at = Date.now() - DAY;
    bybit.getInternalDeposits.mockResolvedValue(
      page([
        {
          id: '42',
          coin: 'USDT',
          amount: '150',
          status: 2,
          address: 'friend@mail.com',
          txID: 'tx42',
          createdTime: String(at),
        },
      ]),
    );

    await service.sync(ACCOUNT, CREDS);

    expect(imported()).toEqual([
      {
        userId: 'u1',
        venueId: 'v1',
        direction: 'IN',
        peer: 'EXTERNAL',
        amount: 150,
        currency: 'USD',
        amountUsd: 150,
        asset: 'USDT',
        assetAmount: 150,
        date: new Date(at),
        source: 'BYBIT',
        externalId: 'internal:42',
        counterparty: 'friend@mail.com',
        txId: 'tx42',
        needsReview: true,
      },
    ]);
    // Re-scans must not duplicate what is already there.
    expect(prisma.investingTransfer.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('imports on-chain deposits and withdrawals, priced, and only the finished ones', async () => {
    const at = String(Date.now() - DAY);
    bybit.getDeposits.mockResolvedValue(
      page([
        {
          id: 'd1',
          coin: 'BTC',
          chain: 'BTC',
          amount: '0.01',
          txID: 'a',
          status: 3,
          successAt: at,
        },
        // Still confirming — not money yet.
        { id: 'd2', coin: 'BTC', chain: 'BTC', amount: '1', txID: 'b', status: 1, successAt: at },
      ]),
    );
    bybit.getWithdrawals.mockResolvedValue(
      page([
        {
          withdrawId: 'w1',
          coin: 'USDT',
          amount: '50',
          status: 'success',
          toAddress: 'T..',
          updateTime: at,
        },
        { withdrawId: 'w2', coin: 'USDT', amount: '70', status: 'Pending', updateTime: at },
      ]),
    );

    await service.sync(ACCOUNT, CREDS);

    expect(imported()).toEqual([
      expect.objectContaining({ externalId: 'deposit:d1', direction: 'IN', amountUsd: 700 }),
      expect.objectContaining({
        externalId: 'withdrawal:w1',
        direction: 'OUT',
        amountUsd: 50,
        counterparty: 'T..',
      }),
    ]);
  });

  it('counts an internal transfer once even if it also shows up as a deposit', async () => {
    const at = String(Date.now() - DAY);
    bybit.getInternalDeposits.mockResolvedValue(
      page([{ id: '7', coin: 'USDT', amount: '10', status: 2, txID: 'same', createdTime: at }]),
    );
    bybit.getDeposits.mockResolvedValue(
      page([
        {
          id: 'd7',
          coin: 'USDT',
          chain: 'x',
          amount: '10',
          txID: 'same',
          status: 3,
          successAt: at,
        },
      ]),
    );

    await service.sync(ACCOUNT, CREDS);

    expect(imported().map((r) => r.externalId)).toEqual(['internal:7']);
  });

  it('ignores anything from before the FUND baseline — it is already inside it', async () => {
    bybit.getInternalDeposits.mockResolvedValue(
      page([
        {
          id: 'old',
          coin: 'USDT',
          amount: '10',
          status: 2,
          createdTime: String(fundSince.getTime() - 1000),
        },
      ]),
    );

    await service.sync(ACCOUNT, CREDS);

    expect(imported()).toEqual([]);
  });

  it('keeps an unpriceable coin on record with no USD figure', async () => {
    bybit.getInternalDeposits.mockResolvedValue(
      page([
        { id: '9', coin: 'NOPE', amount: '5', status: 2, createdTime: String(Date.now() - DAY) },
      ]),
    );

    await service.sync(ACCOUNT, CREDS);

    expect(imported()[0]).toMatchObject({
      asset: 'NOPE',
      assetAmount: 5,
      amount: 0,
      amountUsd: null,
    });
  });

  it('walks history in windows of at most 30 days, following cursors, and saves progress', async () => {
    fundSince = new Date(Date.now() - 45 * DAY);
    venues.ensureForAccount.mockResolvedValue({
      id: 'v1',
      openingFundAt: fundSince,
      movementsSyncedTo: null,
    });
    bybit.getDeposits.mockResolvedValueOnce(page([], 'next')).mockResolvedValue(empty);

    await service.sync(ACCOUNT, CREDS);

    const calls = bybit.getDeposits.mock.calls.map((c) => c[1]);
    expect(calls[0]).toMatchObject({ startTime: fundSince.getTime(), cursor: undefined });
    expect(calls[1]).toMatchObject({ startTime: fundSince.getTime(), cursor: 'next' });
    for (const c of calls) expect(c.endTime - c.startTime).toBeLessThanOrEqual(30 * DAY);
    // Two windows → the cursor saved twice, the last one at "now".
    expect(prisma.investingVenue.update).toHaveBeenCalledTimes(2);
  });

  it('resumes a little behind where it stopped', async () => {
    const syncedTo = new Date(Date.now() - 10 * 60 * 1000);
    venues.ensureForAccount.mockResolvedValue({
      id: 'v1',
      openingFundAt: fundSince,
      movementsSyncedTo: syncedTo,
    });

    await service.sync(ACCOUNT, CREDS);

    const { startTime } = bybit.getDeposits.mock.calls[0][1];
    expect(startTime).toBe(Math.max(syncedTo.getTime() - 60 * 60 * 1000, fundSince.getTime()));
  });

  it('never throws — a history it could not read must not fail the sync', async () => {
    bybit.getWithdrawals.mockRejectedValue(new Error('Bybit error 10005: permission denied'));

    await expect(service.sync(ACCOUNT, CREDS)).resolves.toBeUndefined();
    // Nothing advanced: the same window is tried again next time.
    expect(prisma.investingVenue.update).not.toHaveBeenCalled();
  });
});
