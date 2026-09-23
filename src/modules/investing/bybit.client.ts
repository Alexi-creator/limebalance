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

// One coin's slice of the unified account, as /v5/account/wallet-balance reports it.
export type BybitWalletCoin = {
  coin: string;
  walletBalance: string;
  // Value in USD as Bybit computes it — empty string for coins it cannot price.
  usdValue: string;
  equity: string;
  unrealisedPnl: string;
  [key: string]: unknown;
};

export type BybitWalletBalance = {
  // Everything the account is worth, open positions marked to market included.
  totalEquity: string;
  // Same, minus unrealized PnL — the difference between the two is what open trades are showing.
  totalWalletBalance: string;
  coin: BybitWalletCoin[];
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

// A currently open derivatives position. `side` here is the position's own direction (Buy =
// long, Sell = short) — the OPPOSITE convention from BybitClosedPnlRecord.side (closing order),
// so callers must flip it when storing into Position.side for a uniform read across rows.
export type BybitPositionRecord = {
  symbol: string;
  side: string;
  size: string;
  avgPrice: string;
  leverage: string;
  // `createdTime` is when this position *slot* was first created on Bybit's side and can predate
  // the current entry by months if the symbol was never fully flat in between — `openTime` is when
  // the currently-held (non-zero) position actually started, which is what "opened" should mean.
  // Older payloads may lack it, so callers should fall back to createdTime.
  createdTime: string;
  updatedTime: string;
  openTime?: string;
  // Empty string when not set — never absent, never null.
  takeProfit: string;
  stopLoss: string;
  [key: string]: unknown;
};

export type BybitConvertCoin = {
  coin: string;
  icon: string;
  iconNight: string;
  [key: string]: unknown;
};

// A coin sitting in the FUND account — where deposits land and withdrawals leave from. No USD
// figure comes with it, unlike the unified account's coins, so callers price it themselves.
export type BybitFundCoin = {
  coin: string;
  walletBalance: string;
  [key: string]: unknown;
};

// An on-chain deposit. `status` 3 is the only one that means the money is there.
export type BybitDepositRecord = {
  id?: string;
  coin: string;
  chain: string;
  amount: string;
  txID: string;
  txIndex?: string;
  status: number;
  fromAddress?: string;
  toAddress?: string;
  successAt: string;
  [key: string]: unknown;
};

// Money sent by another Bybit user, off-chain. `address` is how the sender was named — an email,
// a phone number or a UID. `status` 2 is success.
export type BybitInternalDepositRecord = {
  id: string;
  coin: string;
  amount: string;
  status: number;
  address?: string;
  txID?: string;
  createdTime: string;
  [key: string]: unknown;
};

// A withdrawal, on-chain or to another Bybit user. `status` is a word here — "success" when done.
export type BybitWithdrawalRecord = {
  withdrawId: string;
  coin: string;
  chain?: string;
  amount: string;
  withdrawFee?: string;
  status: string;
  toAddress?: string;
  txID?: string;
  updateTime: string;
  [key: string]: unknown;
};

// One P2P order as /v5/p2p/order/simplifyList reports it. `side` 0 = the user bought crypto
// (paid fiat), 1 = sold it. `amount` is the fiat side, `quantity` the coin side. Statuses: 50 is
// completed, 40/80 cancelled, 30/100/110 disputed; anything else is still in progress.
export type BybitP2pOrder = {
  id: string;
  side: number;
  tokenId: string;
  amount: string;
  currencyId: string;
  price: string;
  quantity?: string;
  notifyTokenQuantity?: string;
  fee?: string;
  targetNickName?: string;
  status: number;
  createDate: string;
  [key: string]: unknown;
};

type Page<T> = { list: T[]; nextPageCursor: string };

// Deposit and withdrawal history: a window of at most 30 days, cursor pagination.
type MovementParams = { startTime: number; endTime: number; cursor?: string };

type RangeParams = {
  category: string;
  startTime: number;
  endTime: number;
  cursor?: string;
  limit?: number;
};

// /v5/position/list requires symbol or settleCoin for linear/inverse — no time window (it's a
// live snapshot, not history).
type OpenPositionsParams = {
  category: string;
  settleCoin?: string;
  symbol?: string;
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

  // Currently open derivatives positions — a live snapshot, not history. Spot has no equivalent
  // endpoint (spot "positions" are just balances), so this only ever covers linear/inverse.
  getOpenPositions(
    creds: BybitCredentials,
    params: OpenPositionsParams,
  ): Promise<Page<BybitPositionRecord>> {
    return this.get(creds, '/v5/position/list', { limit: 200, ...params });
  }

  /**
   * What the account is actually worth right now, straight from the exchange.
   *
   * This is the figure a venue's value is read from instead of being accumulated from deposits and
   * PnL: it already includes open positions marked to market, funding, fees and anything that
   * happened before the account was ever connected — none of which we could reconstruct reliably.
   *
   * Verified against a live read-only key whose only permission is ContractTrade(Position), so no
   * extra API-key scope is required (see scripts/probe-bybit-wallet.ts).
   */
  async getWalletBalance(
    creds: BybitCredentials,
    accountType = 'UNIFIED',
  ): Promise<BybitWalletBalance | null> {
    const page = await this.get<{ list: BybitWalletBalance[] }>(
      creds,
      '/v5/account/wallet-balance',
      { accountType },
    );
    return page.list?.[0] ?? null;
  }

  /**
   * The FUND account: where deposits arrive and withdrawals leave from. The unified balance above
   * does not include it, so money sent to the exchange stays invisible until it is moved over.
   * Needs the key's Assets → Wallet → Account Transfer permission (read-only is enough).
   */
  async getFundBalance(creds: BybitCredentials): Promise<BybitFundCoin[]> {
    const result = await this.get<{ balance: BybitFundCoin[] }>(
      creds,
      '/v5/asset/transfer/query-account-coins-balance',
      { accountType: 'FUND' },
    );
    return result.balance ?? [];
  }

  // On-chain deposits. Same permission as the FUND balance.
  async getDeposits(
    creds: BybitCredentials,
    params: MovementParams,
  ): Promise<{ rows: BybitDepositRecord[]; nextPageCursor: string }> {
    return this.get(creds, '/v5/asset/deposit/query-record', { limit: 50, ...params });
  }

  // Deposits from other Bybit users (by email, phone or UID) — they never touch a chain.
  async getInternalDeposits(
    creds: BybitCredentials,
    params: MovementParams,
  ): Promise<{ rows: BybitInternalDepositRecord[]; nextPageCursor: string }> {
    return this.get(creds, '/v5/asset/deposit/query-internal-record', { limit: 50, ...params });
  }

  // Withdrawals of both kinds (withdrawType 2 = on-chain and internal together).
  async getWithdrawals(
    creds: BybitCredentials,
    params: MovementParams,
  ): Promise<{ rows: BybitWithdrawalRecord[]; nextPageCursor: string }> {
    return this.get(creds, '/v5/asset/withdraw/query-record', {
      limit: 50,
      withdrawType: 2,
      ...params,
    });
  }

  /**
   * P2P orders, newest first, one page at a time (`page` starts at 1). Needs the key's Fiat
   * trading → P2P → Orders permission (read-only is enough). The only POST we make — the P2P API
   * takes its filters in a JSON body.
   */
  async getP2pOrders(
    creds: BybitCredentials,
    params: { page: number; size: number; beginTime?: string; endTime?: string },
  ): Promise<{ count: number; items: BybitP2pOrder[] }> {
    return this.post(creds, '/v5/p2p/order/simplifyList', params);
  }

  // Public market data — no API key needed. Used to value manual holdings and manual/spot
  // positions (looked up by bare asset ticker — see PriceService.priceOf).
  async getSpotTickers(): Promise<{ symbol: string; lastPrice: string }[]> {
    return this.getTickers('spot');
  }

  // Public market data — no API key needed. Unlike spot, callers match linear positions by
  // their exact `symbol` (see PriceService.getLinearPrices): Bybit's own multiplier tickers
  // (e.g. SHIB1000USDT quotes the price of 1000 SHIB, not 1) make deriving a bare asset ticker
  // from the symbol unreliable, and inconsistent besides — some multipliers prefix the asset
  // (1000PEPEUSDT), others suffix it (SHIB1000USDT). Reading `lastPrice` straight off this feed
  // by the same symbol sidesteps that entirely, since it's already quoted the same way.
  async getLinearTickers(): Promise<{ symbol: string; lastPrice: string }[]> {
    return this.getTickers('linear');
  }

  // Convert's coin list (GET /v5/asset/exchange/query-coin-list) — the only Bybit endpoint that
  // carries per-coin icon URLs (icon/iconNight). Signed, but not user-specific data, so callers
  // pass a dedicated service key (see CoinIconService), never a connected user's own credentials.
  // accountType=eb_convert_uta + side=0 (fromCoin) asks for the broadest coin list Convert
  // exposes; coverage is whatever's eligible for Convert, not necessarily every tradable symbol.
  async getConvertCoinList(creds: BybitCredentials): Promise<BybitConvertCoin[]> {
    const result = await this.get<{ coins: BybitConvertCoin[] }>(
      creds,
      '/v5/asset/exchange/query-coin-list',
      { accountType: 'eb_convert_uta', side: 0 },
    );
    return result.coins;
  }

  private async getTickers(category: string): Promise<{ symbol: string; lastPrice: string }[]> {
    const res = await fetch(`${this.baseUrl}/v5/market/tickers?category=${category}`);
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status} on /v5/market/tickers`);
    const body = (await res.json()) as {
      retCode: number;
      retMsg: string;
      result: { list: { symbol: string; lastPrice: string }[] };
    };
    if (body.retCode !== 0) throw new BybitApiError(body.retCode, body.retMsg);
    return body.result.list;
  }

  // POST flavour of the v5 signature: the JSON body takes the query string's place in it.
  private async post<T>(creds: BybitCredentials, path: string, body: object): Promise<T> {
    const json = JSON.stringify(body);
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', creds.apiSecret)
      .update(timestamp + creds.apiKey + RECV_WINDOW + json)
      .digest('hex');

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': creds.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
        'X-BAPI-SIGN': signature,
      },
      body: json,
    });
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status} on ${path}`);

    const parsed = (await res.json()) as {
      retCode?: number;
      ret_code?: number;
      retMsg?: string;
      ret_msg?: string;
      result: T;
    };
    // The P2P API answers in the older snake_case envelope on some routes.
    const code = parsed.retCode ?? parsed.ret_code ?? 0;
    if (code !== 0) throw new BybitApiError(code, parsed.retMsg ?? parsed.ret_msg ?? '');
    return parsed.result;
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
