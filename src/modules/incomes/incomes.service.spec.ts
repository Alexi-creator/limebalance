import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { CreateIncomeDto } from './dto/create-income.dto';
import { IncomesService } from './incomes.service';

const makeDto = (over: Partial<CreateIncomeDto> = {}): CreateIncomeDto => ({
  categoryId: 'cat-1',
  amount: 50000,
  description: 'Salary',
  date: new Date('2026-06-01T00:00:00Z'),
  ...over,
});

describe('IncomesService', () => {
  let service: IncomesService;
  let prisma: {
    income: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let currency: { convert: jest.Mock };

  beforeEach(async () => {
    prisma = {
      income: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    currency = { convert: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        IncomesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrencyService, useValue: currency },
        { provide: SubscriptionsService, useValue: { assertCanAddTransaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(IncomesService);
  });

  describe('create', () => {
    it('uses the provided currency and snapshots amountUsd', async () => {
      currency.convert.mockResolvedValue(1400);
      prisma.income.create.mockResolvedValue({ id: 'i1' });
      const dto = makeDto({ currency: 'THB' });

      const result = await service.create('u1', dto);

      expect(currency.convert).toHaveBeenCalledWith(50000, 'THB', 'USD');
      expect(prisma.income.create).toHaveBeenCalledWith({
        data: { ...dto, userId: 'u1', currency: 'THB', amountUsd: 1400 },
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'i1' });
    });

    it("falls back to the user's currency, then to USD", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ currency: 'EUR' });
      currency.convert.mockResolvedValue(1);
      prisma.income.create.mockResolvedValue({});
      await service.create('u1', makeDto({ amount: 1 }));
      expect(currency.convert).toHaveBeenCalledWith(1, 'EUR', 'USD');

      prisma.user.findUnique.mockResolvedValueOnce(null);
      await service.create('u1', makeDto({ amount: 2 }));
      expect(currency.convert).toHaveBeenCalledWith(2, 'USD', 'USD');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing or not owned', async () => {
      prisma.income.findFirst.mockResolvedValue(null);
      await expect(service.findOne('i1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('recomputes amountUsd when the currency changes', async () => {
      prisma.income.findFirst.mockResolvedValue({ id: 'i1', amount: 100, currency: 'USD' });
      currency.convert.mockResolvedValue(95);
      prisma.income.update.mockResolvedValue({});

      await service.update('i1', 'u1', { currency: 'EUR' });

      // amount falls back to the existing value, currency to the new one.
      expect(currency.convert).toHaveBeenCalledWith(100, 'EUR', 'USD');
      expect(prisma.income.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { currency: 'EUR', amountUsd: 95 },
      });
    });

    it('leaves amountUsd untouched when amount/currency are unchanged', async () => {
      prisma.income.findFirst.mockResolvedValue({ id: 'i1', amount: 100, currency: 'USD' });
      prisma.income.update.mockResolvedValue({});

      await service.update('i1', 'u1', { description: 'fixed' });

      expect(currency.convert).not.toHaveBeenCalled();
      expect(prisma.income.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { description: 'fixed' },
      });
    });
  });

  describe('remove', () => {
    it('throws and deletes nothing when not owned', async () => {
      prisma.income.findFirst.mockResolvedValue(null);
      await expect(service.remove('i1', 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.income.delete).not.toHaveBeenCalled();
    });
  });

  describe('removeMany', () => {
    const runTx = (tx: unknown) =>
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    it('deletes every id when all belong to the user', async () => {
      const tx = {
        income: {
          findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      runTx(tx);
      await expect(service.removeMany('u1', ['a', 'b'])).resolves.toEqual({ deleted: 2 });
    });

    it('throws and deletes nothing when some ids are not owned', async () => {
      const tx = {
        income: {
          findMany: jest.fn().mockResolvedValue([{ id: 'a' }]),
          deleteMany: jest.fn(),
        },
      };
      runTx(tx);
      await expect(service.removeMany('u1', ['a', 'b'])).rejects.toThrow(NotFoundException);
      expect(tx.income.deleteMany).not.toHaveBeenCalled();
    });
  });
});
