import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { FxRatesService } from '../currency/fx-rates.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { IncomeCategoriesService } from './income-categories.service';

// Stand-in for the rate resolver FxRatesService hands back for the reported range.
const RATE_AT = () => 1;

describe('IncomeCategoriesService', () => {
  let service: IncomeCategoriesService;
  let prisma: {
    incomeCategory: { findMany: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
    income: { groupBy: jest.Mock; updateMany: jest.Mock };
    filterPreset: { findMany: jest.Mock };
    userState: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock };
  };
  let currency: { getRates: jest.Mock; historicalTotalInBase: jest.Mock };
  let fx: { resolverFor: jest.Mock };

  beforeEach(async () => {
    prisma = {
      incomeCategory: { findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
      income: { groupBy: jest.fn(), updateMany: jest.fn() },
      filterPreset: { findMany: jest.fn().mockResolvedValue([]) },
      userState: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
      user: { findUnique: jest.fn() },
    };
    // The transaction runs its callback against the same mock client.
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    currency = { getRates: jest.fn().mockResolvedValue({}), historicalTotalInBase: jest.fn() };
    fx = { resolverFor: jest.fn().mockResolvedValue(RATE_AT) };

    const module = await Test.createTestingModule({
      providers: [
        IncomeCategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
        { provide: FxRatesService, useValue: fx },
        { provide: SubscriptionsService, useValue: { assertCanAddCategory: jest.fn() } },
      ],
    }).compile();

    service = module.get(IncomeCategoriesService);
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing or not owned', async () => {
      prisma.incomeCategory.findFirst.mockResolvedValue(null);
      await expect(service.findOne('c1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('statsByCategory', () => {
    beforeEach(() => {
      prisma.incomeCategory.findMany.mockResolvedValue([{ id: 'c1', name: 'Salary', emoji: '💰' }]);
      prisma.user.findUnique.mockResolvedValue({ currency: 'USD' });
    });

    it('aggregates groups into the base currency', async () => {
      prisma.income.groupBy.mockResolvedValue([
        {
          categoryId: 'c1',
          currency: 'USD',
          date: new Date('2026-06-10'),
          _sum: { amount: 5000, amountUsd: 5000 },
          _count: { _all: 2 },
        },
      ]);
      currency.historicalTotalInBase.mockReturnValue(5000);

      const res = await service.statsByCategory('u1');

      expect(res[0]).toMatchObject({ count: 2, approxTotal: 5000, baseCurrency: 'USD' });
      expect(currency.historicalTotalInBase).toHaveBeenCalledWith(
        expect.any(Array),
        'USD',
        RATE_AT,
      );
    });

    it('computes the delta when comparing periods', async () => {
      prisma.income.groupBy.mockResolvedValue([
        {
          categoryId: 'c1',
          currency: 'USD',
          date: new Date('2026-06-10'),
          _sum: { amount: 1, amountUsd: 1 },
          _count: { _all: 1 },
        },
      ]);
      currency.historicalTotalInBase.mockReturnValueOnce(120).mockReturnValueOnce(100);

      const res = await service.statsByCategory('u1', { compareFrom: new Date('2026-05-01') });

      expect(res[0]).toMatchObject({ previousApproxTotal: 100, deltaApproxTotal: 20 });
    });
  });

  describe('merge', () => {
    beforeEach(() => {
      prisma.incomeCategory.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, userId: 'u1', name: where.id, emoji: null }),
      );
      prisma.income.updateMany.mockResolvedValue({ count: 3 });
    });

    it('moves the operations, cleans up references and deletes the source', async () => {
      const result = await service.merge('old', 'new', 'u1');

      expect(prisma.income.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', categoryId: 'old' },
        data: { categoryId: 'new' },
      });
      expect(prisma.filterPreset.findMany).toHaveBeenCalled();
      expect(prisma.userState.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', categoryId: 'old' },
      });
      expect(prisma.incomeCategory.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
      expect(result).toEqual({ moved: 3, target: expect.objectContaining({ id: 'new' }) });
    });

    it('refuses to merge a category into itself', async () => {
      await expect(service.merge('c1', 'c1', 'u1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target is not owned', async () => {
      prisma.incomeCategory.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'new' ? null : { id: where.id }),
      );
      await expect(service.merge('old', 'new', 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
