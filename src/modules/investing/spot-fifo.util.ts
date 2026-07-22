// Bybit reports no realized PnL for spot — only individual fills. Each BUY fill is its own lot
// and its own diary entry (not merged with other buys of the same coin): a SELL consumes the
// oldest lots first (FIFO), and each (lot, sell) pairing becomes one closed slice. A lot that's
// fully drained in one shot has its OPEN row flipped to CLOSED in place (same row, so notes
// survive); a lot only partially nibbled stays OPEN with a shrunk qty, and the nibble itself
// becomes its own separate closed row. Lots never touched by a sell are still open right now.

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

// One consumption event: some or all of a specific buy-lot, consumed by a specific sell.
export type SpotClosedSlice = {
  // The buy fill's execId — the lot's stable identity, shared with its OPEN row (see
  // SpotOpenLot.lotKey) so a slice that fully drains the lot can flip that same row in place.
  lotKey: string;
  // True when this slice fully drains what was left of the lot at the time of this sell —
  // the caller should flip the tracked OPEN row for lotKey into this data rather than create a
  // separate one.
  closesLot: boolean;
  // Deterministic dedupe key, unique per (lot, sell) pairing.
  dedupeKey: string;
  symbol: string;
  qty: number;
  // = the lot's own buy price — no cross-lot averaging, each lot is a single buy fill.
  avgEntryPrice: number;
  avgExitPrice: number;
  closedPnl: number;
  openedAt: Date;
  closedAt: Date;
};

export type SpotOpenLot = {
  // The buy fill's execId — this lot's stable identity/dedupe key.
  lotKey: string;
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  openedAt: Date;
};

export type SpotFifoResult = { closed: SpotClosedSlice[]; open: SpotOpenLot[] };

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
export function computeSpotPositions(fills: SpotFill[]): SpotFifoResult {
  const bySymbol = new Map<string, SpotFill[]>();
  for (const fill of fills) {
    if (!splitSymbol(fill.symbol)) continue;
    const list = bySymbol.get(fill.symbol) ?? [];
    list.push(fill);
    bySymbol.set(fill.symbol, list);
  }

  const closed: SpotClosedSlice[] = [];
  const open: SpotOpenLot[] = [];
  for (const [symbol, list] of bySymbol) {
    const parsed = splitSymbol(symbol);
    if (!parsed) continue;
    const { base, quote } = parsed;

    const lots: { execId: string; qty: number; price: number; time: Date }[] = [];
    for (const fill of list) {
      if (fill.side === 'Buy') {
        // A buy fee charged in the base asset means fewer coins actually received.
        const qty = fill.feeCurrency === base ? fill.qty - fill.fee : fill.qty;
        if (qty > EPS)
          lots.push({ execId: fill.execId, qty, price: fill.price, time: fill.execTime });
        continue;
      }

      // Sell: consume the oldest lots one at a time, emitting one closed slice per lot touched.
      // Coins sold beyond what any recorded lot covers (deposits, pre-history) are simply not
      // covered — the excess request just goes unmatched once lots run out.
      let remaining = fill.qty;
      while (remaining > EPS && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remaining);
        const closesLot = take >= lot.qty - EPS;
        // A sell fee in the quote currency comes straight out of the proceeds; attribute it to
        // this slice in proportion to how much of the sell it represents.
        const sliceFee = fill.feeCurrency === quote ? fill.fee * (take / fill.qty) : 0;

        closed.push({
          lotKey: lot.execId,
          closesLot,
          dedupeKey: `spot:${lot.execId}:${fill.execId}`,
          symbol,
          qty: take,
          avgEntryPrice: lot.price,
          avgExitPrice: fill.price,
          closedPnl: (fill.price - lot.price) * take - sliceFee,
          openedAt: lot.time,
          closedAt: fill.execTime,
        });

        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= EPS) lots.shift();
      }
    }

    // Whatever lots survived the walk are what's still held right now, one row each.
    for (const lot of lots) {
      open.push({
        lotKey: lot.execId,
        symbol,
        qty: lot.qty,
        avgEntryPrice: lot.price,
        openedAt: lot.time,
      });
    }
  }
  return { closed, open };
}
