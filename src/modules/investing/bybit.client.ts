import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_BASE_URL = 'https://api.bybit.com';
// Bybit rejects requests whose timestamp is off by more than recv_window ms — 5s is their default.
const RECV_WINDOW = '5000';

export type BybitCredentials = { apiKey: string; apiSecret: string };

// Bybit sends all numbers/timestamps as strings; they are passed to Prisma Decimal fields
// as-is to avoid float precision loss.
export type BybitClosedPnlRecord = {
  orderId: string;
  symbol: string;
  side: string;
  qty: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  closedPnl: string;
  leverage: string;
  createdTime: string;
  updatedTime: string;
  [key: string]: unknown;
};

export type BybitExecutionRecord = {
  execId: string;
  orderId: string;
  symbol: string;
  side: string;
  // "Trade" for real fills, "Funding" for funding-fee settlements (also AdlTrade/BustTrade/Delivery).
  execType: string;
  execPrice: string;
  execQty: string;
  execFee: string;
  feeCurrency?: string;
  execTime: string;
  [key: string]: unknown;
};

type Page<T> = { list: T[]; nextPageCursor: string };

type RangeParams = {
  category: string;
  startTime: number;
  endTime: number;
  cursor?: string;
  limit?: number;
};

export class BybitApiError extends Error {
  constructor(
    readonly retCode: number,
    retMsg: string,
  ) {
    super(`Bybit error ${retCode}: ${retMsg}`);
  }
}

@Injectable()
export class BybitClient {
  constructor(private readonly config: ConfigService) {}

  // BYBIT_API_URL lets deployments behind an ISP block of api.bybit.com use a backup
  // domain (api.bytick.com) — same API, same keys.
  private get baseUrl(): string {
    return this.config.get<string>('BYBIT_API_URL') ?? DEFAULT_BASE_URL;
  }

  // Checks the key is valid by asking Bybit about the key itself. Returns whether it is read-only,
  // so the caller can warn users who pasted a key with trade permissions.
  async validateKey(creds: BybitCredentials): Promise<{ readOnly: boolean }> {
    const result = await this.get<{ readOnly: number }>(creds, '/v5/user/query-api', {});
    return { readOnly: result.readOnly === 1 };
  }

  // Closed positions with realized PnL (derivatives). Window ≤ 7 days, cursor pagination.
  getClosedPnl(creds: BybitCredentials, params: RangeParams): Promise<Page<BybitClosedPnlRecord>> {
    return this.get(creds, '/v5/position/closed-pnl', { limit: 100, ...params });
  }

  // Individual fills. Window ≤ 7 days, cursor pagination.
  getExecutions(creds: BybitCredentials, params: RangeParams): Promise<Page<BybitExecutionRecord>> {
    return this.get(creds, '/v5/execution/list', { limit: 100, ...params });
  }

  // Public market data — no API key needed. Used to value manual holdings.
  async getSpotTickers(): Promise<{ symbol: string; lastPrice: string }[]> {
    const res = await fetch(`${this.baseUrl}/v5/market/tickers?category=spot`);
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status} on /v5/market/tickers`);
    const body = (await res.json()) as {
      retCode: number;
      retMsg: string;
      result: { list: { symbol: string; lastPrice: string }[] };
    };
    if (body.retCode !== 0) throw new BybitApiError(body.retCode, body.retMsg);
    return body.result.list;
  }

  private async get<T>(
    creds: BybitCredentials,
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const queryString = query.toString();

    // v5 signature: HMAC_SHA256(timestamp + apiKey + recvWindow + queryString, apiSecret).
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', creds.apiSecret)
      .update(timestamp + creds.apiKey + RECV_WINDOW + queryString)
      .digest('hex');

    const res = await fetch(`${this.baseUrl}${path}${queryString ? `?${queryString}` : ''}`, {
      headers: {
        'X-BAPI-API-KEY': creds.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
        'X-BAPI-SIGN': signature,
      },
    });
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status} on ${path}`);

    const body = (await res.json()) as { retCode: number; retMsg: string; result: T };
    if (body.retCode !== 0) throw new BybitApiError(body.retCode, body.retMsg);
    return body.result;
  }
}
