import { BadRequestException } from '@nestjs/common';
import { canonicalizeFilters, hashFilters } from './filter-presets.util';

describe('canonicalizeFilters', () => {
  it('sorts keys and arrays, drops duplicates and empty values', () => {
    expect(
      canonicalizeFilters({
        type: 'expense',
        categoryId: ['b', 'a', 'b'],
        search: '',
        currency: [],
        to: null,
        period: 'this_month',
      }),
    ).toEqual({ categoryId: ['a', 'b'], period: 'this_month', type: 'expense' });
  });

  it('hashes the same set the same regardless of order', () => {
    const a = canonicalizeFilters({ type: 'expense', categoryId: ['a', 'b'] });
    const b = canonicalizeFilters({ categoryId: ['b', 'a'], type: 'expense' });
    expect(hashFilters(a)).toBe(hashFilters(b));
    expect(hashFilters(a)).not.toBe(hashFilters(canonicalizeFilters({ type: 'income' })));
  });

  it('rejects nested objects and non-string arrays', () => {
    expect(() => canonicalizeFilters({ x: { y: 1 } })).toThrow(BadRequestException);
    expect(() => canonicalizeFilters({ x: [1, 2] })).toThrow(BadRequestException);
  });

  it('rejects a set with nothing left in it', () => {
    expect(() => canonicalizeFilters({ search: '', categoryId: [] })).toThrow(BadRequestException);
  });
});
