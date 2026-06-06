import type { CurrencyService } from './currency.service';

type Rates = Record<string, number>;

// Строка операции, достаточная для агрегации сводки.
export type SummaryRow = {
  amount: unknown; // Prisma Decimal
  amountUsd: unknown | null;
  currency: string;
  date: Date;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Ключи месяцев от (months-1) назад до текущего включительно, по возрастанию.
export function buildMonthKeys(now: Date, months: number): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

// Помесячная сводка с разбивкой по валютам (валюты не складываются) + прибл. итог
// в базовой валюте через USD-снапшот. Та же логика для трат и доходов.
export function aggregateSummary(
  rows: SummaryRow[],
  monthKeys: string[],
  baseCurrency: string,
  rates: Rates | null,
  currency: CurrencyService,
) {
  type Acc = { amount: number; count: number; usdSum: number; hasUsd: boolean };
  // month -> currency -> накопитель
  const byMonth = new Map<string, Map<string, Acc>>();

  for (const r of rows) {
    const key = monthKey(r.date);
    let curMap = byMonth.get(key);
    if (!curMap) {
      curMap = new Map();
      byMonth.set(key, curMap);
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

  const byMonthOut = monthKeys.map((month) => {
    const curMap = byMonth.get(month);
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
      month,
      totals: groups.map((g) => ({ currency: g.currency, total: g.amount, count: g.count })),
      approxTotal: currency.approxTotalInBase(groups, baseCurrency, rates),
    };
  });

  return {
    baseCurrency,
    total: currency.approxTotalInBase(allGroups, baseCurrency, rates),
    byMonth: byMonthOut,
  };
}
