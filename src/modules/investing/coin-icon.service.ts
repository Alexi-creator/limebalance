import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BybitCredentials } from './bybit.client';
import { BybitClient } from './bybit.client';

// Coin icons practically never change — a day-long cache keeps this to one Bybit call per
// deploy lifetime in practice, same idea as PriceService's TTL but two orders of magnitude longer.
const TTL_MS = 24 * 60 * 60 * 1000;

export type CoinIcon = { icon: string; iconNight: string };

// Symbol -> icon URLs, sourced from Bybit's Convert coin list (the only Bybit endpoint that
// carries icons). Cached in memory, like PriceService. Requires BYBIT_ICON_API_KEY/SECRET — a
// dedicated service-level key, never a connected user's own — since the endpoint is signed but
// the data itself isn't user-specific. Without that key configured, this simply serves an empty
// map forever; the frontend already has its own letter-avatar fallback for missing icons.
@Injectable()
export class CoinIconService {
  private readonly logger = new Logger(CoinIconService.name);
  private cache: { icons: Map<string, CoinIcon>; fetchedAt: number } | null = null;
  private inflight: Promise<Map<string, CoinIcon>> | null = null;

  constructor(
    private readonly bybit: BybitClient,
    private readonly config: ConfigService,
  ) {}

  async getIconMap(): Promise<Map<string, CoinIcon>> {
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) {
      return this.cache.icons;
    }
    if (!this.inflight) {
      this.inflight = this.fetchIcons().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private get credentials(): BybitCredentials | null {
    const apiKey = this.config.get<string>('BYBIT_ICON_API_KEY');
    const apiSecret = this.config.get<string>('BYBIT_ICON_API_SECRET');
    return apiKey && apiSecret ? { apiKey, apiSecret } : null;
  }

  private async fetchIcons(): Promise<Map<string, CoinIcon>> {
    const creds = this.credentials;
    if (!creds) return this.cache?.icons ?? new Map();

    try {
      const coins = await this.bybit.getConvertCoinList(creds);
      const icons = new Map<string, CoinIcon>();
      for (const c of coins) {
        if (c.coin && c.icon)
          icons.set(c.coin.toUpperCase(), { icon: c.icon, iconNight: c.iconNight });
      }
      this.cache = { icons, fetchedAt: Date.now() };
      return icons;
    } catch (err) {
      this.logger.warn(`Failed to fetch Bybit convert coin list: ${err}`);
      return this.cache?.icons ?? new Map();
    }
  }
}
