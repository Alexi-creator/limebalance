import { computeSpotPositions, type SpotFill, splitSymbol } from './spot-fifo.util';

let seq = 0;
const fill = (over: Partial<SpotFill>): SpotFill => ({
  execId: `e${++seq}`,
  symbol: 'BTCUSDT',
  side: 'Buy',
  price: 100,
  qty: 1,
  fee: 0,
  feeCurrency: null,
  execTime: new Date(2026, 0, seq),
  ...over,
});

describe('splitSymbol', () => {
  it('splits dollar-quoted pairs and rejects the rest', () => {
    expect(splitSymbol('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
    expect(splitSymbol('SOLUSDC')).toEqual({ base: 'SOL', quote: 'USDC' });
    expect(splitSymbol('ETHBTC')).toBeNull();
    expect(splitSymbol('USDT')).toBeNull(); // no base part
  });
});

describe('computeSpotPositions', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('matches a simple buy → sell round trip, closing the lot', () => {
    const buy = fill({ side: 'Buy', qty: 1, price: 100 });
    const sell = fill({ side: 'Sell', qty: 1, price: 130 });
    const { closed, open } = computeSpotPositions([buy, sell]);

    expect(open).toHaveLength(0);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      lotKey: buy.execId,
      closesLot: true,
      dedupeKey: `spot:${buy.execId}:${sell.execId}`,
      symbol: 'BTCUSDT',
      qty: 1,
      avgEntryPrice: 100,
      avgExitPrice: 130,
      closedPnl: 30,
      openedAt: buy.execTime,
      closedAt: sell.execTime,
    });
  });

  it('keeps each buy as its own open lot instead of merging them', () => {
    const buy1 = fill({ side: 'Buy', qty: 1, price: 100 });
    const buy2 = fill({ side: 'Buy', qty: 1, price: 200 });
    const { open } = computeSpotPositions([buy1, buy2]);

    expect(open).toHaveLength(2);
    expect(open).toEqual([
      {
        lotKey: buy1.execId,
        symbol: 'BTCUSDT',
        qty: 1,
        avgEntryPrice: 100,
        openedAt: buy1.execTime,
      },
      {
        lotKey: buy2.execId,
        symbol: 'BTCUSDT',
        qty: 1,
        avgEntryPrice: 200,
        openedAt: buy2.execTime,
      },
    ]);
  });

  it('closes lots FIFO one at a time, each slice keeping its own lot entry price', () => {
    const buy1 = fill({ side: 'Buy', qty: 1, price: 100 });
    const buy2 = fill({ side: 'Buy', qty: 1, price: 200 });
    const sell = fill({ side: 'Sell', qty: 1.5, price: 300 });
    const { closed, open } = computeSpotPositions([buy1, buy2, sell]);

    expect(closed).toHaveLength(2);
    // Lot 1 (oldest) is fully drained by this sell.
    expect(closed[0]).toMatchObject({
      lotKey: buy1.execId,
      closesLot: true,
      qty: 1,
      avgEntryPrice: 100,
      closedPnl: 200,
    });
    // Lot 2 is only half-drained — it stays open with the remainder.
    expect(closed[1]).toMatchObject({
      lotKey: buy2.execId,
      closesLot: false,
      qty: 0.5,
      avgEntryPrice: 200,
      closedPnl: 50,
    });
    expect(open).toEqual([
      {
        lotKey: buy2.execId,
        symbol: 'BTCUSDT',
        qty: 0.5,
        avgEntryPrice: 200,
        openedAt: buy2.execTime,
      },
    ]);
  });

  it('leaves the remainder open for the next sell, across multiple partial sells', () => {
    const buy = fill({ side: 'Buy', qty: 2, price: 100 });
    const sell1 = fill({ side: 'Sell', qty: 0.5, price: 110 });
    const sell2 = fill({ side: 'Sell', qty: 0.5, price: 120 });
    const { closed, open } = computeSpotPositions([buy, sell1, sell2]);

    expect(closed).toHaveLength(2);
    expect(closed[0]).toMatchObject({ lotKey: buy.execId, closesLot: false, closedPnl: 5 });
    expect(closed[1]).toMatchObject({ lotKey: buy.execId, closesLot: false, closedPnl: 10 });
    expect(open).toEqual([
      { lotKey: buy.execId, symbol: 'BTCUSDT', qty: 1, avgEntryPrice: 100, openedAt: buy.execTime },
    ]);
  });

  it('skips sells with no recorded buys and trims partially covered ones', () => {
    const deposit = fill({ side: 'Sell', qty: 1, price: 100 }); // sold — no entry known
    const buy = fill({ side: 'Buy', qty: 1, price: 100 });
    const sell = fill({ side: 'Sell', qty: 2, price: 150 }); // only half covered
    const { closed, open } = computeSpotPositions([deposit, buy, sell]);

    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ lotKey: buy.execId, closesLot: true, qty: 1, closedPnl: 50 });
    expect(open).toHaveLength(0);
  });

  it('accounts for fees: base-asset buy fee shrinks the lot, quote sell fee cuts PnL', () => {
    const buy = fill({ side: 'Buy', qty: 1, price: 100, fee: 0.001, feeCurrency: 'BTC' });
    const sell = fill({ side: 'Sell', qty: 0.999, price: 200, fee: 0.2, feeCurrency: 'USDT' });
    const { closed } = computeSpotPositions([buy, sell]);

    expect(closed[0].qty).toBeCloseTo(0.999, 9);
    expect(closed[0].closedPnl).toBeCloseTo((200 - 100) * 0.999 - 0.2, 6);
  });

  it('ignores non-dollar-quoted symbols', () => {
    const { closed, open } = computeSpotPositions([
      fill({ symbol: 'ETHBTC', side: 'Buy' }),
      fill({ symbol: 'ETHBTC', side: 'Sell', price: 200 }),
    ]);
    expect(closed).toHaveLength(0);
    expect(open).toHaveLength(0);
  });

  it('keeps symbols independent', () => {
    const { closed, open } = computeSpotPositions([
      fill({ symbol: 'BTCUSDT', side: 'Buy', qty: 1, price: 100 }),
      fill({ symbol: 'ETHUSDT', side: 'Buy', qty: 1, price: 10 }),
      fill({ symbol: 'ETHUSDT', side: 'Sell', qty: 1, price: 15 }),
    ]);

    expect(closed).toHaveLength(1);
    expect(closed[0].symbol).toBe('ETHUSDT');
    expect(closed[0].closedPnl).toBeCloseTo(5, 6);
    expect(open).toEqual([
      expect.objectContaining({ symbol: 'BTCUSDT', qty: 1, avgEntryPrice: 100 }),
    ]);
  });
});
