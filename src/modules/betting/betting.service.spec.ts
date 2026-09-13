import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { BettingService } from './betting.service';

const ACCOUNT = {
  id: 'a1',
  userId: 'u1',
  name: 'Pinnacle',
  emoji: '🎯',
  kind: 'BETTING' as const,
  currency: 'USD',
  archived: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

const BET = {
  id: 'b1',
  accountId: 'a1',
  userId: 'u1',
  event: 'Arsenal — Chelsea',
  market: '1X2, Arsenal',
  stake: 100,
  odds: 2.5,
  status: 'PENDING' as const,
  payout: null as number | null,
  note: null,
  placedAt: new Date('2026-09-10T18:00:00Z'),
  settledAt: null as Date | null,
  createdAt: new Date('2026-09-10T18:00:00Z'),
};

// Prisma drops `undefined` fields from a write instead of overwriting with them; a plain spread
// would not, and every "only the note changed" edit would read as a wiped row.
const written = (base: Record<string, unknown>, data: Record<string, unknown>) => ({
  ...base,
  ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
});

// groupBy shape the service reads: transfers by account, bets by (account, status).
const transferGroup = (accountId: string, amount: number) => ({ accountId, _sum: { amount } });
const betGroup = (
  accountId: string,
  status: string,
  stake: number,
  payout: number | null,
  count = 1,
) => ({ accountId, status, _sum: { stake, payout }, _count: count });

describe('BettingService', () => {
  let service: BettingService;
  let prisma: {
    externalAccount: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    externalTransfer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      groupBy: jest.Mock;
    };
    bet: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      aggregate: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };
  let currency: { getRates: jest.Mock; convertWithRates: jest.Mock };

  beforeEach(async () => {
    prisma = {
      externalAccount: {
        findMany: jest.fn().mockResolvedValue([ACCOUNT]),
        findFirst: jest.fn().mockResolvedValue(ACCOUNT),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      externalTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      bet: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { odds: null } }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
    };
    currency = {
      getRates: jest.fn().mockResolvedValue({ EUR: 0.9, THB: 32 }),
      convertWithRates: jest.fn((rates, amount, from, to) =>
        from === to
          ? amount
          : (amount / (from === 'USD' ? 1 : rates[from])) * (to === 'USD' ? 1 : rates[to]),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        BettingService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
      ],
    }).compile();

    service = module.get(BettingService);
  });

  describe('listAccounts', () => {
    it('derives the bankroll from transfers and settled bets, never from a stored total', async () => {
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 1_000)]);
      prisma.bet.groupBy.mockResolvedValue([
        betGroup('a1', 'WON', 200, 500, 2), // staked 200, got back 500 -> +300
        betGroup('a1', 'LOST', 150, 0, 3), // -150
        betGroup('a1', 'PENDING', 50, null, 1), // locked, not realized
      ]);

      const [account] = (await service.listAccounts('u1')).items;

      expect(account.transferred).toBe(1_000);
      expect(account.pnl).toBe(150);
      expect(account.value).toBe(1_150);
      expect(account.pendingStake).toBe(50);
      expect(account.available).toBe(1_100);
      expect(account.settledCount).toBe(5);
      expect(account.pendingCount).toBe(1);
    });

    it('rolls foreign accounts into the base currency and flags the estimate', async () => {
      prisma.externalAccount.findMany.mockResolvedValue([
        { ...ACCOUNT, id: 'a1', currency: 'USD' },
        { ...ACCOUNT, id: 'a2', currency: 'EUR' },
      ]);
      prisma.externalTransfer.groupBy.mockResolvedValue([
        transferGroup('a1', 100),
        transferGroup('a2', 90), // 90 EUR = 100 USD at 0.9
      ]);

      const { summary } = await service.listAccounts('u1');

      expect(summary.value).toBe(200);
      expect(summary.isApproximate).toBe(true);
    });
  });

  describe('transfer', () => {
    it('rejects a withdrawal larger than the account has free', async () => {
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 500)]);
      // 400 of the 500 is riding on an unsettled bet, so only 100 can leave.
      prisma.bet.groupBy.mockResolvedValue([betGroup('a1', 'PENDING', 400, null)]);

      await expect(service.transfer('u1', 'a1', { amount: -200 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.externalTransfer.create).not.toHaveBeenCalled();
    });

    it('lets winnings be withdrawn beyond what was ever deposited', async () => {
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 100)]);
      prisma.bet.groupBy.mockResolvedValue([betGroup('a1', 'WON', 100, 300)]); // +200
      prisma.externalTransfer.create.mockResolvedValue({
        id: 't1',
        accountId: 'a1',
        userId: 'u1',
        amount: -250,
        note: null,
        date: new Date('2026-09-13T00:00:00Z'),
        createdAt: new Date(),
      });

      const row = await service.transfer('u1', 'a1', { amount: -250 });

      expect(row.amount).toBe(-250);
      expect(row.currency).toBe('USD');
    });

    it('refuses a zero transfer', async () => {
      await expect(service.transfer('u1', 'a1', { amount: 0 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createBet', () => {
    it('derives the payout of a won bet from stake and odds', async () => {
      prisma.bet.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        written(BET, data),
      );

      const bet = await service.createBet('u1', 'a1', {
        event: 'Arsenal — Chelsea',
        stake: 100,
        odds: 2.5,
        status: 'WON' as never,
      });

      expect(bet.payout).toBe(250);
      expect(bet.pnl).toBe(150);
      expect(bet.settledAt).not.toBeNull();
    });

    it('gives a void bet its stake back, for a PnL of exactly zero', async () => {
      prisma.bet.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        written(BET, data),
      );

      const bet = await service.createBet('u1', 'a1', {
        event: 'Rain delay',
        stake: 100,
        odds: 2.5,
        status: 'VOID' as never,
      });

      expect(bet.payout).toBe(100);
      expect(bet.pnl).toBe(0);
    });

    it('leaves a pending bet without a result at all', async () => {
      prisma.bet.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        written(BET, data),
      );

      const bet = await service.createBet('u1', 'a1', {
        event: 'Arsenal — Chelsea',
        stake: 100,
        odds: 2.5,
      });

      // null, not 0 — an undecided bet is not a breakeven one.
      expect(bet.pnl).toBeNull();
      expect(bet.payout).toBeNull();
      expect(bet.settledAt).toBeNull();
    });

    it('refuses a cashout with no payout, since none can be derived', async () => {
      await expect(
        service.createBet('u1', 'a1', {
          event: 'Arsenal — Chelsea',
          stake: 100,
          odds: 2.5,
          status: 'CASHOUT' as never,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown account', async () => {
      prisma.externalAccount.findFirst.mockResolvedValue(null);
      await expect(
        service.createBet('u1', 'nope', { event: 'x', stake: 1, odds: 2 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateBet', () => {
    beforeEach(() => {
      prisma.bet.findFirst.mockResolvedValue({ ...BET, account: { currency: 'USD' } });
      prisma.bet.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        written(BET, data),
      );
    });

    it('settles a pending bet at the payout it actually returned', async () => {
      const bet = await service.updateBet('u1', 'b1', { status: 'CASHOUT' as never, payout: 120 });

      expect(bet.payout).toBe(120);
      expect(bet.pnl).toBe(20);
      expect(bet.settledAt).not.toBeNull();
    });

    it('clears the result when a bet is put back to pending', async () => {
      prisma.bet.findFirst.mockResolvedValue({
        ...BET,
        status: 'WON',
        payout: 250,
        settledAt: new Date('2026-09-11T00:00:00Z'),
        account: { currency: 'USD' },
      });

      const bet = await service.updateBet('u1', 'b1', { status: 'PENDING' as never });

      expect(bet.payout).toBeNull();
      expect(bet.pnl).toBeNull();
      expect(bet.settledAt).toBeNull();
    });

    it('keeps the recorded payout when only the note is edited', async () => {
      prisma.bet.findFirst.mockResolvedValue({
        ...BET,
        status: 'CASHOUT',
        payout: 120,
        settledAt: new Date('2026-09-11T00:00:00Z'),
        account: { currency: 'USD' },
      });

      const bet = await service.updateBet('u1', 'b1', { note: 'выкупил на 80 минуте' });

      // Not re-derived: a cashout payout is unrecoverable once overwritten.
      expect(bet.payout).toBe(120);
    });
  });

  describe('listBets', () => {
    it('measures winrate and ROI over the whole filter, with void out of both', async () => {
      prisma.bet.groupBy.mockResolvedValue([
        { status: 'WON', _sum: { stake: 300, payout: 700 }, _count: 3 },
        { status: 'LOST', _sum: { stake: 200, payout: 0 }, _count: 2 },
        { status: 'VOID', _sum: { stake: 100, payout: 100 }, _count: 1 },
        { status: 'PENDING', _sum: { stake: 50, payout: null }, _count: 1 },
      ]);
      prisma.bet.count.mockResolvedValue(7);
      prisma.bet.aggregate.mockResolvedValue({ _avg: { odds: 2.333 } });

      const { summary } = await service.listBets('u1', {});

      expect(summary.pnl).toBe(200); // +400 on wins, −200 on losses, 0 on the void
      expect(summary.turnover).toBe(500); // the returned void stake was never at risk
      expect(summary.winRate).toBe(60); // 3 of 5 decided
      expect(summary.roi).toBe(40); // 200 / 500
      expect(summary.settledCount).toBe(6);
      expect(summary.pendingCount).toBe(1);
    });

    it('has no winrate or ROI before anything is settled', async () => {
      prisma.bet.groupBy.mockResolvedValue([
        { status: 'PENDING', _sum: { stake: 50, payout: null }, _count: 1 },
      ]);

      const { summary } = await service.listBets('u1', {});

      expect(summary.winRate).toBeNull();
      expect(summary.roi).toBeNull();
    });
  });

  describe('removeAccount', () => {
    it('refuses to delete an account that still holds money', async () => {
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 500)]);

      await expect(service.removeAccount('u1', 'a1')).rejects.toThrow(BadRequestException);
      expect(prisma.externalAccount.delete).not.toHaveBeenCalled();
    });

    it('deletes an emptied account', async () => {
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 0)]);

      await expect(service.removeAccount('u1', 'a1')).resolves.toEqual({ success: true });
      expect(prisma.externalAccount.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });
  });

  describe('balanceRows', () => {
    it('reports deposits and current value separately, per currency', async () => {
      prisma.externalAccount.findMany.mockResolvedValue([
        { id: 'a1', currency: 'USD' },
        { id: 'a2', currency: 'USD' },
        { id: 'a3', currency: 'THB' },
      ]);
      prisma.externalTransfer.groupBy.mockResolvedValue([
        transferGroup('a1', 1_000),
        transferGroup('a2', 500),
        transferGroup('a3', 20_000),
      ]);
      prisma.bet.groupBy.mockResolvedValue([betGroup('a1', 'WON', 100, 300)]); // +200

      const rows = await service.balanceRows('u1');

      expect(rows.transferred).toEqual([
        { currency: 'USD', amount: 1_500 },
        { currency: 'THB', amount: 20_000 },
      ]);
      expect(rows.value).toEqual([
        { currency: 'USD', amount: 1_700 },
        { currency: 'THB', amount: 20_000 },
      ]);
    });

    it('counts archived accounts too — hiding a card must not conjure money back', async () => {
      prisma.externalAccount.findMany.mockResolvedValue([{ id: 'a1', currency: 'USD' }]);
      prisma.externalTransfer.groupBy.mockResolvedValue([transferGroup('a1', 300)]);

      const rows = await service.balanceRows('u1');

      // The query is not filtered on `archived` at all.
      expect(prisma.externalAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { id: true, currency: true },
      });
      expect(rows.transferred).toEqual([{ currency: 'USD', amount: 300 }]);
    });
  });
});
