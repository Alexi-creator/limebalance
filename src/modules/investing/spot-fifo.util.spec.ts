import { buildSpotClosedTrades, type SpotFill, splitSymbol } from './spot-fifo.util';

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

describe('buildSpotClosedTrades', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('matches a simple buy → sell round trip', () => {
    const trades = buildSpotClosedTrades([
      fill({ side: 'Buy', qty: 1, price: 100 }),
      fill({ side: 'Sell', qty: 1, price: 130 }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'BTCUSDT',
      qty: 1,
      avgEntryPrice: 100,
      avgExitPrice: 130,
      closedPnl: 30,
      dedupeKey: 'spot:e2',
    });
    // Entry date = the consumed lot's buy date.
    expect(trades[0].openedAt).toEqual(new Date(2026, 0, 1));
    expect(trades[0].closedAt).toEqual(new Date(2026, 0, 2));
  });

  it('consumes lots FIFO with a weighted average entry across them', () => {
    const trades = buildSpotClosedTrades([
      fill({ side: 'Buy', qty: 1, price: 100 }),
      fill({ side: 'Buy', qty: 1, price: 200 }),
      fill({ side: 'Sell', qty: 1.5, price: 300 }),
    ]);

    // 1 @ 100 + 0.5 @ 200 → avg 133.33…
    expect(trades[0].qty).toBe(1.5);
    expect(trades[0].avgEntryPrice).toBeCloseTo(400 / 3, 6);
    expect(trades[0].closedPnl).toBeCloseTo((300 - 400 / 3) * 1.5, 6);
    expect(trades[0].openedAt).toEqual(new Date(2026, 0, 1)); // oldest lot
  });

  it('leaves the remainder for the next sell', () => {
    const trades = buildSpotClosedTrades([
      fill({ side: 'Buy', qty: 2, price: 100 }),
      fill({ side: 'Sell', qty: 0.5, price: 110 }),
      fill({ side: 'Sell', qty: 0.5, price: 120 }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades[0].closedPnl).toBeCloseTo(5, 6);
    expect(trades[1].closedPnl).toBeCloseTo(10, 6);
  });

  it('skips sells with no recorded buys and trims partially covered ones', () => {
    const trades = buildSpotClosedTrades([
      fill({ side: 'Sell', qty: 1, price: 100 }), // deposit sold — no entry known
      fill({ side: 'Buy', qty: 1, price: 100 }),
      fill({ side: 'Sell', qty: 2, price: 150 }), // only half covered
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].qty).toBe(1); // covered part only
    expect(trades[0].closedPnl).toBeCloseTo(50, 6);
  });

  it('accounts for fees: base-asset buy fee shrinks the lot, quote sell fee cuts PnL', () => {
    const trades = buildSpotClosedTrades([
      fill({ side: 'Buy', qty: 1, price: 100, fee: 0.001, feeCurrency: 'BTC' }),
      fill({ side: 'Sell', qty: 0.999, price: 200, fee: 0.2, feeCurrency: 'USDT' }),
    ]);

    expect(trades[0].qty).toBeCloseTo(0.999, 9);
    expect(trades[0].closedPnl).toBeCloseTo((200 - 100) * 0.999 - 0.2, 6);
  });

  it('ignores non-dollar-quoted symbols', () => {
    const trades = buildSpotClosedTrades([
      fill({ symbol: 'ETHBTC', side: 'Buy' }),
      fill({ symbol: 'ETHBTC', side: 'Sell', price: 200 }),
    ]);
    expect(trades).toHaveLength(0);
  });

  it('keeps symbols independent', () => {
    const trades = buildSpotClosedTrades([
      fill({ symbol: 'BTCUSDT', side: 'Buy', qty: 1, price: 100 }),
      fill({ symbol: 'ETHUSDT', side: 'Buy', qty: 1, price: 10 }),
      fill({ symbol: 'ETHUSDT', side: 'Sell', qty: 1, price: 15 }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe('ETHUSDT');
    expect(trades[0].closedPnl).toBeCloseTo(5, 6);
  });
});
