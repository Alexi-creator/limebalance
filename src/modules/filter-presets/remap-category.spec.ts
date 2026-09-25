import { FilterPresetScope } from '@prisma/client';
import { canonicalizeFilters, hashFilters } from './filter-presets.util';
import { remapCategoryInPresets } from './remap-category';

const preset = (id: string, filters: Record<string, unknown>) => ({
  id,
  userId: 'u1',
  scope: FilterPresetScope.TRANSACTIONS,
  name: id,
  filters,
  filtersHash: hashFilters(canonicalizeFilters(filters)),
  createdAt: new Date('2026-09-01'),
});

describe('remapCategoryInPresets', () => {
  let tx: {
    filterPreset: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    tx = {
      filterPreset: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
  });

  const run = () => remapCategoryInPresets(tx as never, 'u1', 'old', 'new');

  it('repoints a preset from the merged category to the target', async () => {
    tx.filterPreset.findMany.mockResolvedValue([
      preset('p1', { type: 'expense', categoryId: ['old', 'c2'] }),
    ]);
    await run();

    const filters = { categoryId: ['c2', 'new'], type: 'expense' };
    expect(tx.filterPreset.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { filters, filtersHash: hashFilters(filters) },
    });
    expect(tx.filterPreset.delete).not.toHaveBeenCalled();
  });

  it('collapses the ids when the preset already had the target', async () => {
    tx.filterPreset.findMany.mockResolvedValue([preset('p1', { categoryId: ['old', 'new'] })]);
    await run();

    expect(tx.filterPreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ filters: { categoryId: ['new'] } }),
      }),
    );
  });

  it('drops a preset that would duplicate an existing one', async () => {
    tx.filterPreset.findMany.mockResolvedValue([preset('p1', { categoryId: ['old'] })]);
    tx.filterPreset.findFirst.mockResolvedValue(preset('p2', { categoryId: ['new'] }));
    await run();

    expect(tx.filterPreset.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        scope: FilterPresetScope.TRANSACTIONS,
        filtersHash: hashFilters({ categoryId: ['new'] }),
        id: { not: 'p1' },
      },
    });
    expect(tx.filterPreset.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(tx.filterPreset.update).not.toHaveBeenCalled();
  });

  it('leaves presets that do not mention the merged category alone', async () => {
    tx.filterPreset.findMany.mockResolvedValue([
      preset('p1', { categoryId: ['c2'] }),
      preset('p2', { type: 'income' }),
    ]);
    await run();

    expect(tx.filterPreset.findFirst).not.toHaveBeenCalled();
    expect(tx.filterPreset.update).not.toHaveBeenCalled();
    expect(tx.filterPreset.delete).not.toHaveBeenCalled();
  });
});
