import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    $queryRaw: jest.Mock;
    income: { groupBy: jest.Mock };
    expense: { groupBy: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let currency: { getRates: jest.Mock; approxTotalInBase: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      income: { groupBy: jest.fn() },
      expense: { groupBy: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'USD' }) },
    };
    currency = { getRates: jest.fn().mockResolvedValue({}), approxTotalInBase: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  describe('findAll', () => {
    it('paginates and summarizes income/expense/net over the whole filtered set', async () => {
      // Raw queries, in call order: items, count, expenseGroups, incomeGroups.
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 't1', type: 'expense' }])
        .mockResolvedValueOnce([{ count: 12n }])
        .mockResolvedValueOnce([{ currency: 'USD', amount: 50, amountUsd: 50 }])
        .mockResolvedValueOnce([{ currency: 'USD', amount: 200, amountUsd: 200 }]);
      // approxTotalInBase order: income first, then expense.
      currency.approxTotalInBase.mockReturnValueOnce(200).mockReturnValueOnce(50);

      const res = await service.findAll('u1', { page: 2, limit: 5 });

      expect(res.total).toBe(12);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(5);
      expect(res.totalPages).toBe(3); // ceil(12 / 5)
      expect(res.summary).toEqual({ baseCurrency: 'USD', income: 200, expense: 50, net: 150 });
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
    it('returns income − expense in both USD and the base currency', async () => {
      prisma.income.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 200, amountUsd: 200 } },
      ]);
      prisma.expense.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { amount: 50, amountUsd: 50 } },
      ]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'EUR' });
      // order: incomeUsd, expenseUsd, incomeBase, expenseBase
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(180)
        .mockReturnValueOnce(45);

      const res = await service.getBalance('u1');

      expect(res).toEqual({ baseCurrency: 'EUR', balanceUsd: 150, balance: 135 });
    });

    it('returns a null balance when a total is unavailable', async () => {
      prisma.income.groupBy.mockResolvedValue([]);
      prisma.expense.groupBy.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'USD' });
      currency.approxTotalInBase
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(200)
        .mockReturnValueOnce(null);

      const res = await service.getBalance('u1');

      expect(res.balanceUsd).toBe(150);
      expect(res.balance).toBeNull();
    });
  });
});
