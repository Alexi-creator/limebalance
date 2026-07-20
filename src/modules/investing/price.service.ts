import { Injectable, Logger } from '@nestjs/common';
import { BybitClient } from './bybit.client';

const TTL_MS = 60_000;

// Current USD prices for crypto assets via Bybit's public spot tickers (BTC → BTCUSDT.lastPrice).
// Cached in memory like CurrencyService does for fiat rates. null = prices unavailable right now.
@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private cache: { prices: Map<string, number>; fetchedAt: number } | null = null;
  private inflight: Promise<Map<string, number> | null> | null = null;

  constructor(private readonly bybit: BybitClient) {}

  async getUsdPrices(): Promise<Map<string, number> | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) {
      return this.cache.prices;
    }
    this.inflight ??= this.fetchPrices().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  // Price of one unit of `asset` in USD. Stablecoins pegged to the dollar are 1 by definition.
  priceOf(asset: string, prices: Map<string, number>): number | null {
    const ticker = asset.toUpperCase();
    if (ticker === 'USDT' || ticker === 'USD' || ticker === 'USDC') return 1;
    return prices.get(`${ticker}USDT`) ?? null;
  }

  private async fetchPrices(): Promise<Map<string, number> | null> {
    try {
      const list = await this.bybit.getSpotTickers();
      const prices = new Map<string, number>();
      for (const t of list) {
        const price = Number(t.lastPrice);
        if (Number.isFinite(price) && price > 0) prices.set(t.symbol, price);
      }
      this.cache = { prices, fetchedAt: Date.now() };
      return prices;
    } catch (err) {
      this.logger.warn(`Failed to fetch Bybit tickers: ${err}`);
      return this.cache?.prices ?? null;
    }
  }
}
