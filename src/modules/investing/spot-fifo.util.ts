// Bybit reports no realized PnL for spot — only individual fills. We derive closed spot trades
// ourselves: buys stack up as FIFO lots, each sell consumes the oldest lots and becomes one
// ClosedPosition-shaped record (weighted average entry, the first consumed lot's time as openedAt).

export type SpotFill = {
  execId: string;
  symbol: string;
  side: string; // Buy | Sell
  price: number;
  qty: number;
  fee: number;
  feeCurrency: string | null;
  execTime: Date;
};

export type SpotClosedTrade = {
  // Deterministic dedupe key (the closing sell fill), so re-runs upsert instead of duplicating.
  dedupeKey: string;
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  closedPnl: number;
  openedAt: Date | null;
  closedAt: Date;
};

// Only dollar-quoted pairs take part in PnL matching — for them the numbers mean USD like the
// rest of the diary. Other quotes (BTC-, ETH-pairs) are stored as fills but not matched.
const QUOTES = ['USDT', 'USDC'];

const EPS = 1e-12;

export function splitSymbol(symbol: string): { base: string; quote: string } | null {
  for (const quote of QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { base: symbol.slice(0, -quote.length), quote };
    }
  }
  return null;
}

// Fills must come in chronological order (oldest first) covering the account's whole history —
// FIFO state is rebuilt from scratch on every call, which keeps the computation stateless.
export function buildSpotClosedTrades(fills: SpotFill[]): SpotClosedTrade[] {
  const bySymbol = new Map<string, SpotFill[]>();
  for (const fill of fills) {
    if (!splitSymbol(fill.symbol)) continue;
    const list = bySymbol.get(fill.symbol) ?? [];
    list.push(fill);
    bySymbol.set(fill.symbol, list);
  }

  const trades: SpotClosedTrade[] = [];
  for (const [symbol, list] of bySymbol) {
    const parsed = splitSymbol(symbol);
    if (!parsed) continue;
    const { base, quote } = parsed;

    const lots: { qty: number; price: number; time: Date }[] = [];
    for (const fill of list) {
      if (fill.side === 'Buy') {
        // A buy fee charged in the base asset means fewer coins actually received.
        const qty = fill.feeCurrency === base ? fill.qty - fill.fee : fill.qty;
        if (qty > EPS) lots.push({ qty, price: fill.price, time: fill.execTime });
        continue;
      }

      // Sell: consume the oldest lots.
      let remaining = fill.qty;
      let cost = 0;
      let covered = 0;
      let openedAt: Date | null = null;
      while (remaining > EPS && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remaining);
        cost += take * lot.price;
        covered += take;
        openedAt ??= lot.time;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= EPS) lots.shift();
      }
      // Coins sold without a recorded buy (deposits, pre-history) have no entry price — skip.
      if (covered <= EPS) continue;

      const avgEntryPrice = cost / covered;
      // A sell fee in the quote currency comes straight out of the proceeds; when the sell is
      // only partially covered by known lots, attribute the fee proportionally.
      const sellFee = fill.feeCurrency === quote ? fill.fee * (covered / fill.qty) : 0;

      trades.push({
        dedupeKey: `spot:${fill.execId}`,
        symbol,
        qty: covered,
        avgEntryPrice,
        avgExitPrice: fill.price,
        closedPnl: (fill.price - avgEntryPrice) * covered - sellFee,
        openedAt,
        closedAt: fill.execTime,
      });
    }
  }
  return trades;
}
