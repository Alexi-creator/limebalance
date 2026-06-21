import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { GoalsService } from './goals.service';

const goalRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'g1',
  userId: 'u1',
  name: 'Отпуск на Бали',
  emoji: '🌴',
  targetAmount: 240000,
  currency: 'THB',
  targetDate: new Date('2026-08-01'),
  archived: false,
  completedAt: null,
  createdAt: new Date('2026-01-01'),
  ...over,
});

describe('GoalsService', () => {
  let service: GoalsService;
  let prisma: {
    goal: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    goalContribution: {
      groupBy: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    notification: { upsert: jest.Mock };
  };
  let currency: { getRates: jest.Mock; approxTotalInBase: jest.Mock };

  beforeEach(async () => {
    prisma = {
      goal: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      goalContribution: {
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ currency: 'THB' }) },
      notification: { upsert: jest.fn().mockResolvedValue({}) },
    };
    currency = { getRates: jest.fn().mockResolvedValue({}), approxTotalInBase: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
      ],
    }).compile();

    service = module.get(GoalsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('list', () => {
    it('computes progress / remaining / monthsLeft / perMonth and the summary', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-21T00:00:00Z'));
      prisma.goal.findMany.mockResolvedValue([goalRow()]);
      prisma.goalContribution.groupBy.mockResolvedValue([
        { goalId: 'g1', _sum: { amount: 60000 } },
      ]);
      // buildSummary: saved first, then target.
      currency.approxTotalInBase.mockReturnValueOnce(60000).mockReturnValueOnce(240000);

      const res = await service.list('u1');

      expect(res.items[0]).toMatchObject({
        currentAmount: 60000,
        progress: 25, // 60000 / 240000
        remaining: 180000,
        monthsLeft: 2, // Jun → Aug
        perMonth: 90000, // 180000 / 2
        isCompleted: false,
        isOverdue: false,
      });
      expect(res.summary).toEqual({
        baseCurrency: 'THB',
        activeCount: 1,
        totalSaved: 60000,
        totalTarget: 240000,
        totalRemaining: 180000,
        overallProgress: 25,
      });
    });

    it('marks a goal overdue when the deadline passed and it is unmet', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-21T00:00:00Z'));
      prisma.goal.findMany.mockResolvedValue([
        goalRow({ targetDate: new Date('2026-04-01'), targetAmount: 1000 }),
      ]);
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 100 } }]);
      currency.approxTotalInBase.mockReturnValueOnce(100).mockReturnValueOnce(1000);

      const res = await service.list('u1');

      expect(res.items[0].isOverdue).toBe(true);
      expect(res.items[0].monthsLeft).toBe(0);
    });
  });

  describe('create', () => {
    it('returns a goal without a deadline with null monthsLeft/perMonth', async () => {
      prisma.goal.create.mockResolvedValue(
        goalRow({ targetDate: null, targetAmount: 1000, emoji: null }),
      );

      const dto = await service.create('u1', {
        name: 'Подушка',
        targetAmount: 1000,
        currency: 'THB',
      });

      expect(dto).toMatchObject({
        currentAmount: 0,
        progress: 0,
        remaining: 1000,
        monthsLeft: null,
        perMonth: null,
        isCompleted: false,
      });
    });
  });

  describe('contribute', () => {
    beforeEach(() => {
      prisma.goal.findFirst.mockResolvedValue(goalRow({ targetAmount: 100, completedAt: null }));
    });

    it('rejects a contribution that would exceed the target', async () => {
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 80 } }]);

      await expect(service.contribute('u1', 'g1', { amount: 30 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
    });

    it('rejects a withdrawal that would go negative', async () => {
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 80 } }]);

      await expect(service.contribute('u1', 'g1', { amount: -90 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.goalContribution.create).not.toHaveBeenCalled();
    });

    it('rejects a zero amount', async () => {
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 80 } }]);

      await expect(service.contribute('u1', 'g1', { amount: 0 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('saves a contribution and does not notify when below target', async () => {
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 50 } }]);

      const dto = await service.contribute('u1', 'g1', { amount: 20 });

      expect(prisma.goalContribution.create).toHaveBeenCalled();
      expect(prisma.goal.update).not.toHaveBeenCalled();
      expect(prisma.notification.upsert).not.toHaveBeenCalled();
      expect(dto.currentAmount).toBe(70);
      expect(dto.isCompleted).toBe(false);
    });

    it('completes the goal and fires the achievement notification on reaching target', async () => {
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 80 } }]);
      prisma.goal.update.mockResolvedValue(
        goalRow({ targetAmount: 100, completedAt: new Date('2026-06-21') }),
      );

      const dto = await service.contribute('u1', 'g1', { amount: 20 });

      expect(prisma.goal.update).toHaveBeenCalled();
      expect(prisma.notification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_dedupeKey: { userId: 'u1', dedupeKey: 'goal_completed:g1' } },
          create: expect.objectContaining({ type: 'goal_completed' }),
        }),
      );
      expect(dto.currentAmount).toBe(100);
      expect(dto.isCompleted).toBe(true);
    });

    it("throws NotFound for a goal that is not the user's", async () => {
      prisma.goal.findFirst.mockResolvedValue(null);

      await expect(service.contribute('u1', 'gX', { amount: 10 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reservedRows', () => {
    it('returns net contributed amount per active goal currency, zero when none', async () => {
      prisma.goal.findMany.mockResolvedValue([
        { id: 'g1', currency: 'THB' },
        { id: 'g2', currency: 'USD' },
      ]);
      prisma.goalContribution.groupBy.mockResolvedValue([{ goalId: 'g1', _sum: { amount: 100 } }]);

      const rows = await service.reservedRows('u1');

      expect(rows).toEqual([
        { currency: 'THB', amount: 100, amountUsd: null },
        { currency: 'USD', amount: 0, amountUsd: null },
      ]);
    });
  });

  describe('removeContribution', () => {
    it('throws NotFound when nothing was deleted', async () => {
      prisma.goal.findFirst.mockResolvedValue(goalRow());
      prisma.goalContribution.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeContribution('u1', 'g1', 'cX')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
