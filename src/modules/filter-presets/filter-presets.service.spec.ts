import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FilterPresetScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FilterPresetsService,
  PRESET_FILTERS_EXIST,
  PRESET_NAME_EXISTS,
} from './filter-presets.service';
import { canonicalizeFilters, hashFilters } from './filter-presets.util';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'p1',
  userId: 'u1',
  scope: FilterPresetScope.TRANSACTIONS,
  name: 'Еда',
  filters: { type: 'expense' },
  filtersHash: hashFilters(canonicalizeFilters({ type: 'expense' })),
  createdAt: new Date('2026-09-01'),
  ...over,
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ConflictException);
    return ((err as ConflictException).getResponse() as { code: string }).code;
  }
  throw new Error('expected a conflict');
};

describe('FilterPresetsService', () => {
  let service: FilterPresetsService;
  let prisma: {
    filterPreset: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      filterPreset: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [FilterPresetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(FilterPresetsService);
  });

  it('lists the scope, mapped to the API scope name', async () => {
    prisma.filterPreset.findMany.mockResolvedValue([row()]);
    const res = await service.list('u1', 'transactions');
    expect(prisma.filterPreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', scope: FilterPresetScope.TRANSACTIONS } }),
    );
    expect(res[0]).toMatchObject({ id: 'p1', scope: 'transactions', name: 'Еда' });
  });

  it('stores canonical filters with their hash and a trimmed name', async () => {
    prisma.filterPreset.create.mockImplementation(({ data }) => Promise.resolve(row(data)));
    await service.create('u1', {
      scope: 'positions',
      name: '  Лонги  ',
      filters: { status: 'OPEN', symbol: '', accountId: 'a1' },
    });
    const { data } = prisma.filterPreset.create.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: 'u1',
      scope: FilterPresetScope.POSITIONS,
      name: 'Лонги',
      filters: { accountId: 'a1', status: 'OPEN' },
    });
    expect(data.filtersHash).toBe(hashFilters({ accountId: 'a1', status: 'OPEN' }));
  });

  it('refuses a filter set that is already saved', async () => {
    prisma.filterPreset.findFirst.mockResolvedValue(row());
    const code = await codeOf(
      service.create('u1', { scope: 'transactions', name: 'Другое', filters: { type: 'expense' } }),
    );
    expect(code).toBe(PRESET_FILTERS_EXIST);
    expect(prisma.filterPreset.create).not.toHaveBeenCalled();
  });

  it('refuses a taken name', async () => {
    prisma.filterPreset.findFirst.mockResolvedValue(row({ filtersHash: 'other' }));
    const code = await codeOf(
      service.create('u1', { scope: 'transactions', name: 'Еда', filters: { type: 'income' } }),
    );
    expect(code).toBe(PRESET_NAME_EXISTS);
  });

  it('maps a raced unique violation to a 409', async () => {
    prisma.filterPreset.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
        meta: { target: ['user_id', 'scope', 'filters_hash'] },
      }),
    );
    const code = await codeOf(
      service.create('u1', { scope: 'transactions', name: 'X', filters: { type: 'income' } }),
    );
    expect(code).toBe(PRESET_FILTERS_EXIST);
  });

  it('renames, refusing a name another preset of the same table has', async () => {
    prisma.filterPreset.findFirst
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ id: 'p2', name: 'Такси' }));
    expect(await codeOf(service.rename('u1', 'p1', { name: 'Такси' }))).toBe(PRESET_NAME_EXISTS);

    prisma.filterPreset.findFirst
      .mockReset()
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(null);
    prisma.filterPreset.update.mockResolvedValue(row({ name: 'Продукты' }));
    const res = await service.rename('u1', 'p1', { name: ' Продукты ' });
    expect(prisma.filterPreset.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: 'Продукты' },
    });
    expect(res.name).toBe('Продукты');
  });

  it("does not touch another user's preset", async () => {
    await expect(service.rename('u2', 'p1', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.filterPreset.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.filterPreset.deleteMany).toHaveBeenCalledWith({
      where: { id: 'p1', userId: 'u2' },
    });
  });
});
