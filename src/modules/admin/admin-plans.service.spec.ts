import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPlansService } from './admin-plans.service';

// A Prisma plan row as findUnique/create/update return it (price is a Decimal, subscribers via _count).
function planRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    name: 'pro',
    maxCategories: 15,
    maxTransactionsPerMonth: null,
    price: new Prisma.Decimal('4.99'),
    investingAccess: true,
    archivedAt: null,
    _count: { subscriptions: 0 },
    ...over,
  };
}

describe('AdminPlansService', () => {
  let service: AdminPlansService;
  let prisma: {
    plan: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    userSubscription: { groupBy: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      plan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // Default: no active subscribers. Individual tests override to exercise the merge.
      userSubscription: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module = await Test.createTestingModule({
      providers: [AdminPlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminPlansService);
  });

  describe('list', () => {
    it('flattens rows and merges the active-subscriber count (total incl. expired)', async () => {
      prisma.plan.findMany.mockResolvedValue([planRow({ _count: { subscriptions: 7 } })]);
      // 7 total subscription rows, but only 4 are still active (not expired).
      prisma.userSubscription.groupBy.mockResolvedValue([{ planId: 'p1', _count: { _all: 4 } }]);

      const res = await service.list();

      expect(res).toEqual([
        {
          id: 'p1',
          name: 'pro',
          maxCategories: 15,
          maxTransactionsPerMonth: null,
          price: 4.99,
          investingAccess: true,
          archivedAt: null,
          isArchived: false,
          subscribers: 7,
          activeSubscribers: 4,
        },
      ]);
      expect(prisma.plan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { price: 'asc' } }),
      );
    });

    it('defaults activeSubscribers to 0 for a plan with no active group', async () => {
      prisma.plan.findMany.mockResolvedValue([planRow({ _count: { subscriptions: 2 } })]);
      prisma.userSubscription.groupBy.mockResolvedValue([]); // no active rows for any plan

      const [row] = await service.list();

      expect(row).toMatchObject({ subscribers: 2, activeSubscribers: 0 });
    });
  });

  describe('create', () => {
    it('defaults omitted limits to null (unlimited) and investingAccess to false', async () => {
      prisma.plan.create.mockResolvedValue(planRow());

      await service.create({ name: 'plus', price: 2 });

      expect(prisma.plan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'plus',
            maxCategories: null,
            maxTransactionsPerMonth: null,
            price: 2,
            investingAccess: false,
          },
        }),
      );
    });

    it('maps a duplicate-name (P2002) to ConflictException', async () => {
      prisma.plan.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7' }),
      );

      await expect(service.create({ name: 'pro', price: 1 })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('only writes fields that were sent; null limit means unlimited', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow());
      prisma.plan.update.mockResolvedValue(planRow({ maxCategories: null }));

      await service.update('p1', { maxCategories: null });

      expect(prisma.plan.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' }, data: { maxCategories: null } }),
      );
    });

    it('leaves out untouched fields entirely (empty data for an empty patch)', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow());
      prisma.plan.update.mockResolvedValue(planRow());

      await service.update('p1', {});

      expect(prisma.plan.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
    });

    it('throws NotFoundException for an unknown plan', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { price: 1 })).rejects.toThrow(NotFoundException);
      expect(prisma.plan.update).not.toHaveBeenCalled();
    });
  });

  describe('setArchived', () => {
    it('archives a plan by stamping archivedAt', async () => {
      // Read twice: the pre-check (active) and the final row returned to the caller (archived).
      prisma.plan.findUnique
        .mockResolvedValueOnce(planRow())
        .mockResolvedValueOnce(planRow({ archivedAt: new Date() }));
      prisma.plan.update.mockResolvedValue(planRow({ archivedAt: new Date() }));

      const res = await service.setArchived('p1', true);

      expect(prisma.plan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { archivedAt: expect.any(Date) },
      });
      expect(res.isArchived).toBe(true);
    });

    it('unarchives a plan by clearing archivedAt', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow({ archivedAt: new Date() }));
      prisma.plan.update.mockResolvedValue(planRow({ archivedAt: null }));

      await service.setArchived('p1', false);

      expect(prisma.plan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { archivedAt: null },
      });
    });

    it('refuses to archive the free plan', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow({ name: 'free' }));
      await expect(service.setArchived('p1', true)).rejects.toThrow(ConflictException);
      expect(prisma.plan.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses to delete the free plan', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow({ name: 'free' }));
      await expect(service.remove('p1')).rejects.toThrow(ConflictException);
      expect(prisma.plan.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a plan that still has subscribers', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow({ _count: { subscriptions: 3 } }));
      await expect(service.remove('p1')).rejects.toThrow(ConflictException);
      expect(prisma.plan.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty non-free plan and returns its row', async () => {
      prisma.plan.findUnique.mockResolvedValue(planRow({ _count: { subscriptions: 0 } }));
      prisma.plan.delete.mockResolvedValue(planRow());

      const res = await service.remove('p1');

      expect(prisma.plan.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(res).toMatchObject({ id: 'p1', name: 'pro', subscribers: 0 });
    });
  });
});
