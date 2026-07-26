import { Injectable, Logger } from '@nestjs/common';
import { BybitClient } from './bybit.client';

const TTL_MS = 60_000;

type Category = 'spot' | 'linear';

// Current USD prices for crypto assets via Bybit's public tickers. Cached in memory per
// category, like CurrencyService does for fiat rates. null = prices unavailable right now.
@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly caches = new Map<Category, { prices: Map<string, number>; fetchedAt: number }>();
  private readonly inflight = new Map<Category, Promise<Map<string, number> | null>>();

  constructor(private readonly bybit: BybitClient) {}

  // Keyed by bare asset ticker via `priceOf` below (BTC → BTCUSDT.lastPrice) — for callers that
  // only have an asset name, not an exchange symbol: Holdings and manual diary entries.
  async getUsdPrices(): Promise<Map<string, number> | null> {
    return this.getPrices('spot');
  }

  // Keyed by the exact linear symbol (e.g. "BTCUSDT", "SHIB1000USDT") — for synced linear
  // positions, whose `symbol` already IS that exact key. Look it up directly with `.get(symbol)`;
  // don't run it through `priceOf`, which assumes a bare asset ticker and would mis-derive
  // multiplier tickers like SHIB1000USDT.
  async getLinearPrices(): Promise<Map<string, number> | null> {
    return this.getPrices('linear');
  }

  // Price of one unit of `asset` in USD. Stablecoins pegged to the dollar are 1 by definition.
  priceOf(asset: string, prices: Map<string, number>): number | null {
    const ticker = asset.toUpperCase();
    if (ticker === 'USDT' || ticker === 'USD' || ticker === 'USDC') return 1;
    return prices.get(`${ticker}USDT`) ?? null;
  }

  private async getPrices(category: Category): Promise<Map<string, number> | null> {
    const cached = this.caches.get(category);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached.prices;
    }
    let pending = this.inflight.get(category);
    if (!pending) {
      pending = this.fetchPrices(category).finally(() => {
        this.inflight.delete(category);
      });
      this.inflight.set(category, pending);
    }
    return pending;
  }

  private async fetchPrices(category: Category): Promise<Map<string, number> | null> {
    try {
      const list =
        category === 'spot'
          ? await this.bybit.getSpotTickers()
          : await this.bybit.getLinearTickers();
      const prices = new Map<string, number>();
      for (const t of list) {
        const price = Number(t.lastPrice);
        if (Number.isFinite(price) && price > 0) prices.set(t.symbol, price);
      }
      this.caches.set(category, { prices, fetchedAt: Date.now() });
      return prices;
    } catch (err) {
      this.logger.warn(`Failed to fetch Bybit ${category} tickers: ${err}`);
      return this.caches.get(category)?.prices ?? null;
    }
  }
}
