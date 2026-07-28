import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { GoalsService } from '../goals/goals.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    $queryRaw: jest.Mock;
    income: { groupBy: jest.Mock };
    expense: { groupBy: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let currency: { getRates: jest.Mock; approxTotalInBase: jest.Mock; usdToBase: jest.Mock };
  let goals: { reservedRows: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      income: { groupBy: jest.fn() },
      expense: { groupBy: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
    };
    currency = {
      getRates: jest.fn().mockResolvedValue({}),
      approxTotalInBase: jest.fn(),
      usdToBase: jest.fn(),
    };
    goals = { reservedRows: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
        { provide: GoalsService, useValue: goals },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  describe('findAll', () => {
    it('paginates and summarizes income/expense/net over the current page (items)', async () => {
      // Raw queries, in call order: items, count.
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { id: 'i1', type: 'income', currency: 'USD', amount: 200, amountUsd: 200 },
          { id: 'e1', type: 'expense', currency: 'USD', amount: 50, amountUsd: 50 },
        ])
        .mockResolvedValueOnce([{ count: 12n }]);
      // approxTotalInBase order: income first, then expense.
      currency.approxTotalInBase.mockReturnValueOnce(200).mockReturnValueOnce(50);

      const res = await service.findAll('u1', { page: 2, limit: 5 });

      expect(res.total).toBe(12);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(5);
      expect(res.totalPages).toBe(3); // ceil(12 / 5)
      expect(res.summary).toEqual({ baseCurrency: 'USD', income: 200, expense: 50, net: 150 });
      // The summary is derived from the page rows, split by type.
      expect(currency.approxTotalInBase).toHaveBeenNthCalledWith(
        1,
        [{ id: 'i1', type: 'income', currency: 'USD', amount: 200, amountUsd: 200 }],
        'USD',
        {},
        'income',
      );
      expect(currency.approxTotalInBase).toHaveBeenNthCalledWith(
        2,
        [{ id: 'e1', type: 'expense', currency: 'USD', amount: 50, amountUsd: 50 }],
        'USD',
        {},
        'expense',
      );
      // amountUsd is internal and must not leak into the response items.
      expect(res.items).toEqual([
        { id: 'i1', type: 'income', currency: 'USD', amount: 200 },
        { id: 'e1', type: 'expense', currency: 'USD', amount: 50 },
      ]);
    });

    it('reports net=null when a total could not be computed (rates unavailable)', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      currency.approxTotalInBase.mockReturnValueOnce(null).mockReturnValueOnce(50);

      const res = await service.findAll('u1', {});

      expect(res.summary.net).toBeNull();
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);
    });
  });

  describe('getBalance', () => {
    it('returns the free balance (income − expense − goals) in USD, converted once into the base currency', async () => {
      prisma.income.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 200, amountUsd: 200 } },
      ]);
      prisma.expense.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 50, amountUsd: 50 } },
      ]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'EUR' });
      // No active goals reserve anything.
      // order: incomeUsd, expenseUsd, goalsUsd — the base-currency figures are never a separate
      // aggregation, only usdToBase(balanceUsd)/usdToBase(goalsUsd).
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(0);
      currency.usdToBase.mockReturnValueOnce(135).mockReturnValueOnce(0);

      const res = await service.getBalance('u1');

      expect(res).toEqual({
        baseCurrency: 'EUR',
        balanceUsd: 150,
        balance: 135,
        inGoals: 0,
        inGoalsUsd: 0,
      });
      // Exactly 3 calls (USD only) — never a second, independent aggregation into the base
      // currency, which is what let balance/balanceUsd disagree in sign in production.
      expect(currency.approxTotalInBase).toHaveBeenCalledTimes(3);
      expect(currency.usdToBase).toHaveBeenNthCalledWith(1, 150, 'EUR', {});
      expect(currency.usdToBase).toHaveBeenNthCalledWith(2, 0, 'EUR', {});
    });

    it('subtracts money reserved in active goals from the free balance', async () => {
      prisma.income.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 200, amountUsd: 200 } },
      ]);
      prisma.expense.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 50, amountUsd: 50 } },
      ]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'EUR' });
      goals.reservedRows.mockResolvedValue([{ currency: 'USD', amount: 30, amountUsd: null }]);
      // order: incomeUsd, expenseUsd, goalsUsd
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(30);
      currency.usdToBase.mockReturnValueOnce(108).mockReturnValueOnce(27);

      const res = await service.getBalance('u1');

      expect(res).toEqual({
        baseCurrency: 'EUR',
        balanceUsd: 120, // 200 − 50 − 30
        balance: 108,
        inGoals: 27,
        inGoalsUsd: 30,
      });
    });

    it('skips the USD→base conversion entirely when the base currency already is USD', async () => {
      prisma.income.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 200, amountUsd: 200 } },
      ]);
      prisma.expense.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 50, amountUsd: 50 } },
      ]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'USD' });
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(0);

      const res = await service.getBalance('u1');

      expect(res).toEqual({
        baseCurrency: 'USD',
        balanceUsd: 150,
        balance: 150,
        inGoals: 0,
        inGoalsUsd: 0,
      });
      // balance is balanceUsd, not a converted copy — no rates dependency for a USD user.
      expect(currency.usdToBase).not.toHaveBeenCalled();
    });

    it('returns a null base-currency balance (but a non-null USD one) when rates are unavailable', async () => {
      prisma.income.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 200, amountUsd: 200 } },
      ]);
      prisma.expense.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 50, amountUsd: 50 } },
      ]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'EUR' });
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(0);
      currency.usdToBase.mockReturnValue(null); // rates unavailable

      const res = await service.getBalance('u1');

      expect(res.balanceUsd).toBe(150);
      expect(res.balance).toBeNull();
      expect(res.inGoals).toBeNull();
    });
  });
});
