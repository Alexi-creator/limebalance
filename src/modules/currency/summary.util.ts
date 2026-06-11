import type { CurrencyService, FlowKind } from './currency.service';

type Rates = Record<string, number>;

export type Granularity = 'day' | 'week' | 'month';

// Строка операции, достаточная для агрегации сводки.
export type SummaryRow = {
  amount: unknown; // Prisma Decimal
  amountUsd: unknown | null;
  currency: string;
  date: Date;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const pad = (n: number) => String(n).padStart(2, '0');

const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// Понедельник недели, в которую попадает дата (начало бакета week).
const weekStart = (d: Date) => {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (r.getDay() + 6) % 7; // 0 = понедельник
  r.setDate(r.getDate() - dow);
  return r;
};

// Ключ бакета: день — YYYY-MM-DD, неделя — YYYY-MM-DD её понедельника, месяц — YYYY-MM.
export function bucketKey(d: Date, granularity: Granularity): string {
  if (granularity === 'day') return dayKey(d);
  if (granularity === 'week') return dayKey(weekStart(d));
  return monthKey(d);
}

// Ключи всех бакетов в диапазоне [from, to] включительно, по возрастанию.
export function buildBuckets(from: Date, to: Date, granularity: Granularity): string[] {
  const cursor =
    granularity === 'month'
      ? new Date(from.getFullYear(), from.getMonth(), 1)
      : granularity === 'week'
        ? weekStart(from)
        : new Date(from.getFullYear(), from.getMonth(), from.getDate());

  const keys: string[] = [];
  while (cursor <= to) {
    keys.push(bucketKey(cursor, granularity));
    if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

// Разбор параметров /summary: диапазон from/to + granularity.
// По умолчанию — текущий месяц с помесячными бакетами.
export function resolveSummaryRange(params: { from?: string; to?: string; granularity?: string }): {
  from: Date;
  to: Date;
  granularity: Granularity;
} {
  const granularity = normalizeGranularity(params.granularity) ?? 'month';
  const to = params.to ? new Date(params.to) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to, granularity };
}

function normalizeGranularity(value?: string): Granularity | undefined {
  return value === 'day' || value === 'week' || value === 'month' ? value : undefined;
}

// Сводка по бакетам с разбивкой по валютам (валюты не складываются) + прибл. итог
// в базовой валюте через USD-снапшот. Та же логика для трат и доходов.
export function aggregateSummary(
  rows: SummaryRow[],
  bucketKeys: string[],
  granularity: Granularity,
  baseCurrency: string,
  rates: Rates | null,
  currency: CurrencyService,
  direction: FlowKind = 'none',
) {
  type Acc = { amount: number; count: number; usdSum: number; hasUsd: boolean };
  // bucket -> currency -> накопитель
  const byBucket = new Map<string, Map<string, Acc>>();

  for (const r of rows) {
    const key = bucketKey(r.date, granularity);
    let curMap = byBucket.get(key);
    if (!curMap) {
      curMap = new Map();
      byBucket.set(key, curMap);
    }
    let acc = curMap.get(r.currency);
    if (!acc) {
      acc = { amount: 0, count: 0, usdSum: 0, hasUsd: false };
      curMap.set(r.currency, acc);
    }
    acc.amount += Number(r.amount);
    acc.count += 1;
    // amountUsd === null, если у строки нет снапшота — тогда approx берёт фолбэк по курсу.
    if (r.amountUsd != null) {
      acc.usdSum += Number(r.amountUsd);
      acc.hasUsd = true;
    }
  }

  // Все группы за период — для прибл. итога одной конвертацией.
  const allGroups: { currency: string; amount: number; amountUsd: number | null }[] = [];

  const buckets = bucketKeys.map((bucket) => {
    const curMap = byBucket.get(bucket);
    const groups = curMap
      ? [...curMap.entries()].map(([cur, a]) => ({
          currency: cur,
          amount: round2(a.amount),
          count: a.count,
          amountUsd: a.hasUsd ? a.usdSum : null,
        }))
      : [];
    allGroups.push(...groups);
    return {
      bucket,
      totals: groups.map((g) => ({ currency: g.currency, total: g.amount, count: g.count })),
      approxTotal: currency.approxTotalInBase(groups, baseCurrency, rates, direction),
    };
  });

  return {
    baseCurrency,
    granularity,
    total: currency.approxTotalInBase(allGroups, baseCurrency, rates, direction),
    buckets,
  };
}
