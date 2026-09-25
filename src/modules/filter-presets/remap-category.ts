import { FilterPresetScope, type Prisma } from '@prisma/client';
import { canonicalizeFilters, hashFilters } from './filter-presets.util';

/**
 * Points every transactions preset that filters by `fromId` at `toId` instead, for when one
 * category is merged into another — otherwise the preset would keep a dangling id and silently
 * match nothing. A preset that becomes identical to one the user already has is dropped, since
 * the unique (userId, scope, filtersHash) index would refuse it and the other one covers it.
 * Runs inside the caller's transaction so the presets move together with the operations.
 */
export async function remapCategoryInPresets(
  tx: Prisma.TransactionClient,
  userId: string,
  fromId: string,
  toId: string,
): Promise<void> {
  // A user has a handful of presets, so filtering them here beats a JSON-path query.
  const presets = await tx.filterPreset.findMany({
    where: { userId, scope: FilterPresetScope.TRANSACTIONS },
    orderBy: { createdAt: 'asc' },
  });

  for (const preset of presets) {
    const filters = preset.filters as Record<string, unknown>;
    const ids = filters.categoryId;
    if (!Array.isArray(ids) || !ids.includes(fromId)) continue;

    const next = canonicalizeFilters({
      ...filters,
      categoryId: ids.map((id) => (id === fromId ? toId : id)),
    });
    const filtersHash = hashFilters(next);
    // Sequential on purpose: an earlier preset updated in this loop counts as "already there".
    const twin = await tx.filterPreset.findFirst({
      where: { userId, scope: preset.scope, filtersHash, id: { not: preset.id } },
    });
    if (twin) {
      await tx.filterPreset.delete({ where: { id: preset.id } });
    } else {
      await tx.filterPreset.update({
        where: { id: preset.id },
        data: { filters: next, filtersHash },
      });
    }
  }
}
