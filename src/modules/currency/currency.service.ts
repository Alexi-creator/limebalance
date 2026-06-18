import { Injectable, Logger } from '@nestjs/common';

// Rates relative to USD: rates[X] = how many units of X per 1 USD.
type Rates = Record<string, number>;

// Flow direction for the real-conversion adjustment (see approxTotalInBase).
export type FlowKind = 'expense' | 'income' | 'none';

const BASE = 'USD';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const ENDPOINT = `https://open.er-api.com/v6/latest/${BASE}`;

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private cache: { rates: Rates; fetchedAt: number } | null = null;
  private inflight: Promise<Rates | null> | null = null;

  // Adjustment for the real cost of converting currencies (exchange spread + fees): the
  // mid-market rate is unreachable in practice. A fraction, configurable via env FX_SPREAD; defaults to 2%.
  private readonly fxSpread = CurrencyService.parseSpread(process.env.FX_SPREAD);

  private static parseSpread(raw: string | undefined): number {
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.02;
  }

  // Current rates with an in-memory cache. null if the fetch failed and there is no cache.
  async getRates(): Promise<Rates | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) {
      return this.cache.rates;
    }
    // Avoid spawning parallel requests to the API.
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchRates().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchRates(): Promise<Rates | null> {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result?: string; rates?: Rates };
      if (data.result !== 'success' || !data.rates) throw new Error('Invalid rates API response');
      this.cache = { rates: data.rates, fetchedAt: Date.now() };
      return data.rates;
    } catch (err) {
      this.logger.warn(`Failed to fetch currency rates: ${err}`);
      // Return the stale cache if present, otherwise null.
      return this.cache?.rates ?? null;
    }
  }

  // Pure conversion using already-fetched rates. null if the currency is unknown.
  convertWithRates(rates: Rates, amount: number, from: string, to: string): number | null {
    if (from === to) return amount;
    const fromRate = from === BASE ? 1 : rates[from];
    const toRate = to === BASE ? 1 : rates[to];
    if (!fromRate || !toRate) return null;
    return (amount / fromRate) * toRate;
  }

  // One-off conversion of a single amount. null if rates are unavailable or the currency is unknown.
  async convert(amount: number, from: string, to: string): Promise<number | null> {
    if (from === to) return amount;
    const rates = await this.getRates();
    if (!rates) return null;
    return this.convertWithRates(rates, amount, from, to);
  }

  // Sum of rows in USD via the snapshot (amountUsd), falling back to the current rate for rows
  // without a snapshot. null if rates are unavailable or an unknown currency was encountered.
  sumUsd(
    rows: { amount: number; currency: string; amountUsd: number | null }[],
    rates: Rates | null,
  ): number | null {
    if (rows.length === 0) return 0;
    if (!rates) return null;

    let usdSum = 0;
    for (const r of rows) {
      const usd =
        r.amountUsd != null
          ? r.amountUsd
          : this.convertWithRates(rates, r.amount, r.currency, BASE);
      if (usd === null) return null;
      usdSum += usd;
    }
    return usdSum;
  }

  // Convert a USD amount into the base currency at the current rate. Rounds to 2 decimals (an estimate).
  usdToBase(usd: number, baseCurrency: string, rates: Rates | null): number | null {
    if (!rates) return null;
    const inBase = this.convertWithRates(rates, usd, BASE, baseCurrency);
    if (inBase === null) return null;
    return Math.round(inBase * 100) / 100;
  }

  // Aggregates a set of amounts into the base currency, converting EACH row individually.
  // Rows already in the base currency are taken directly (no conversion): otherwise the round-trip
  // base → USD (snapshot) → base (current rate) at different rates diverges from the sum of the
  // items themselves. Other currencies are converted via USD (amountUsd snapshot, otherwise the
  // current rate), then USD → base at the current rate.
  // Returns null if conversion needs rates and they are unavailable / the currency is unknown.
  approxTotalInBase(
    rows: { amount: number; currency: string; amountUsd: number | null }[],
    baseCurrency: string,
    rates: Rates | null,
    direction: FlowKind = 'none',
  ): number | null {
    // The real-conversion adjustment is applied ONLY to cross-currency rows and
    // directionally: an expense really cost more (×1+spread), income was really received less
    // (×1−spread). Rows in the base currency are taken as-is.
    const factor =
      direction === 'expense' ? 1 + this.fxSpread : direction === 'income' ? 1 - this.fxSpread : 1;
    let sum = 0;
    for (const r of rows) {
      if (r.currency === baseCurrency) {
        sum += r.amount;
        continue;
      }
      // Row value in USD: the snapshot at creation time, otherwise recomputed at the current rate.
      const usd =
        r.amountUsd != null ? r.amountUsd : this.convert_(rates, r.amount, r.currency, BASE);
      if (usd === null) return null;
      // USD → base currency at the current rate, with the spread adjustment.
      const inBase = baseCurrency === BASE ? usd : this.convert_(rates, usd, BASE, baseCurrency);
      if (inBase === null) return null;
      sum += inBase * factor;
    }
    return Math.round(sum * 100) / 100;
  }

  // convertWithRates guarded against null rates (needed only for cross-currency rows).
  private convert_(rates: Rates | null, amount: number, from: string, to: string): number | null {
    if (from === to) return amount;
    if (!rates) return null;
    return this.convertWithRates(rates, amount, from, to);
  }
}
