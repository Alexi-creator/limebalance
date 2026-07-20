// Bybit's Closed PnL API gives qty/avgEntryPrice/closedPnl for linear positions directly, but no
// open time. We derive it from the fills: each execution's `closedSize` (part of Bybit's raw
// payload) tells us how much of that fill reduced an existing position — the remainder is a fresh
// opening lot. FIFO-consuming those opening lots against each closing record's own qty gives the
// time of the oldest lot still open at close, i.e. openedAt.

const EPS = 1e-12;

export type LinearFill = {
  symbol: string;
  side: string; // Buy | Sell
  qty: number;
  // Portion of `qty` that reduced an existing opposite position; qty - closedSize is a fresh
  // opening lot in this fill's own side. Missing on older payloads → treated as fully opening.
  closedSize: number;
  execTime: Date;
};

export type LinearPosition = {
  id: string;
  symbol: string;
  // Side of the CLOSING order — same convention as ClosedPosition.
  side: string; // Buy | Sell
  qty: number;
  closedAt: Date;
};

type Lot = { qty: number; time: Date };

// Fills and positions may arrive in any order — both are sorted internally per symbol.
export function deriveLinearOpenedAt(
  fills: LinearFill[],
  positions: LinearPosition[],
): Map<string, Date> {
  const result = new Map<string, Date>();

  const fillsBySymbol = new Map<string, LinearFill[]>();
  for (const f of fills) {
    const list = fillsBySymbol.get(f.symbol) ?? [];
    list.push(f);
    fillsBySymbol.set(f.symbol, list);
  }
  const positionsBySymbol = new Map<string, LinearPosition[]>();
  for (const p of positions) {
    const list = positionsBySymbol.get(p.symbol) ?? [];
    list.push(p);
    positionsBySymbol.set(p.symbol, list);
  }

  for (const [symbol, symbolPositions] of positionsBySymbol) {
    const symbolFills = (fillsBySymbol.get(symbol) ?? [])
      .slice()
      .sort((a, b) => a.execTime.getTime() - b.execTime.getTime());
    const sortedPositions = symbolPositions
      .slice()
      .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

    // One FIFO queue of open lots per side — under one-way position mode a symbol holds either
    // long or short lots at a time, so only one queue is ever non-empty in practice.
    const queues: Record<'Buy' | 'Sell', Lot[]> = { Buy: [], Sell: [] };

    let fi = 0;
    for (const pos of sortedPositions) {
      // Feed every fill up to this position's close into the queues before consuming from them.
      while (fi < symbolFills.length && symbolFills[fi].execTime <= pos.closedAt) {
        const f = symbolFills[fi];
        fi++;
        if (f.side !== 'Buy' && f.side !== 'Sell') continue;
        const openingQty = f.qty - f.closedSize;
        if (openingQty > EPS) queues[f.side].push({ qty: openingQty, time: f.execTime });
      }

      const entrySide = pos.side === 'Sell' ? 'Buy' : 'Sell';
      const queue = queues[entrySide];
      let remaining = pos.qty;
      let openedAt: Date | null = null;
      while (remaining > EPS && queue.length) {
        const lot = queue[0];
        const take = Math.min(lot.qty, remaining);
        openedAt ??= lot.time;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= EPS) queue.shift();
      }
      if (openedAt) result.set(pos.id, openedAt);
    }
  }

  return result;
}
