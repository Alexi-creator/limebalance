import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { FilterPresetScope } from '@prisma/client';

export const FILTER_PRESET_SCOPES = ['transactions', 'positions'] as const;
export type FilterPresetScopeParam = (typeof FILTER_PRESET_SCOPES)[number];

export const toScope = (scope: FilterPresetScopeParam): FilterPresetScope =>
  scope === 'transactions' ? FilterPresetScope.TRANSACTIONS : FilterPresetScope.POSITIONS;

export const fromScope = (scope: FilterPresetScope): FilterPresetScopeParam =>
  scope === FilterPresetScope.TRANSACTIONS ? 'transactions' : 'positions';

const MAX_KEYS = 30;
const MAX_STRING = 200;
const MAX_ARRAY = 200;

type FilterValue = string | number | boolean | string[];

/**
 * Brings a filter set to one canonical form, so two sets that filter the same way compare (and
 * hash) equal: keys sorted, arrays sorted and de-duplicated, empty values (null, "", []) dropped.
 * Only flat primitives and string arrays are accepted — that is all a table's URL params hold.
 */
export function canonicalizeFilters(filters: Record<string, unknown>): Record<string, FilterValue> {
  const out: Record<string, FilterValue> = {};
  const keys = Object.keys(filters).sort();
  if (keys.length > MAX_KEYS) throw new BadRequestException('Too many filters');
  for (const key of keys) {
    const value = filters[key];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (
        value.length > MAX_ARRAY ||
        !value.every((v) => typeof v === 'string' && v.length <= MAX_STRING)
      ) {
        throw new BadRequestException(`Filter "${key}" must be an array of strings`);
      }
      const items = [...new Set(value as string[])].sort();
      if (items.length > 0) out[key] = items;
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_STRING) throw new BadRequestException(`Filter "${key}" is too long`);
      out[key] = value;
      continue;
    }
    if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    throw new BadRequestException(`Filter "${key}" has an unsupported value`);
  }
  if (Object.keys(out).length === 0)
    throw new BadRequestException('A preset needs at least one filter');
  return out;
}

/** Keys are already sorted by canonicalizeFilters, so plain JSON.stringify is stable. */
export const hashFilters = (canonical: Record<string, FilterValue>): string =>
  createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
