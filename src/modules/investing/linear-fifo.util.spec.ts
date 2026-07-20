import { deriveLinearOpenedAt, type LinearFill, type LinearPosition } from './linear-fifo.util';

let seq = 0;
const fill = (over: Partial<LinearFill>): LinearFill => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  qty: 1,
  closedSize: 0,
  execTime: new Date(2026, 0, ++seq),
  ...over,
});
const position = (over: Partial<LinearPosition>): LinearPosition => ({
  id: `p${++seq}`,
  symbol: 'BTCUSDT',
  side: 'Sell',
  qty: 1,
  closedAt: new Date(2026, 0, ++seq),
  ...over,
});

describe('deriveLinearOpenedAt', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('matches a simple open → close round trip', () => {
    const openFill = fill({ side: 'Buy', qty: 1, closedSize: 0 });
    const pos = position({ id: 'p1', side: 'Sell', qty: 1 });

    const result = deriveLinearOpenedAt([openFill], [pos]);

    expect(result.get('p1')).toEqual(openFill.execTime);
  });

  it('consumes opening lots FIFO — the oldest lot decides openedAt', () => {
    const first = fill({ side: 'Buy', qty: 1, closedSize: 0 });
    const second = fill({ side: 'Buy', qty: 1, closedSize: 0 });
    const pos = position({ id: 'p1', side: 'Sell', qty: 1.5 });

    const result = deriveLinearOpenedAt([first, second], [pos]);

    expect(result.get('p1')).toEqual(first.execTime);
  });

  it('treats qty - closedSize as the fresh opening lot in a fill that also reduces a position', () => {
    // Fully opens 1, of which 0.4 is later reported as having closed something else —
    // only the remaining 0.6 is a genuine new opening lot.
    const openFill = fill({ side: 'Buy', qty: 1, closedSize: 0.4 });
    const pos = position({ id: 'p1', side: 'Sell', qty: 0.6 });

    const result = deriveLinearOpenedAt([openFill], [pos]);

    expect(result.get('p1')).toEqual(openFill.execTime);
  });

  it('does not set openedAt when the opening fills predate the synced history', () => {
    // The position closes 1 but no opening fill for it was ever synced.
    const pos = position({ id: 'p1', side: 'Sell', qty: 1 });

    const result = deriveLinearOpenedAt([], [pos]);

    expect(result.has('p1')).toBe(false);
  });

  it('feeds a fresh queue for the next position once the prior one is fully closed', () => {
    const openA = fill({ side: 'Buy', qty: 1, closedSize: 0 });
    const posA = position({ id: 'pA', side: 'Sell', qty: 1 });
    const openB = fill({ side: 'Buy', qty: 1, closedSize: 0 });
    const posB = position({ id: 'pB', side: 'Sell', qty: 1 });

    const result = deriveLinearOpenedAt([openA, openB], [posA, posB]);

    expect(result.get('pA')).toEqual(openA.execTime);
    expect(result.get('pB')).toEqual(openB.execTime);
  });

  it('sorts out-of-order fills and positions internally', () => {
    const older = fill({ side: 'Buy', qty: 1, closedSize: 0, execTime: new Date(2026, 0, 1) });
    const newer = fill({ side: 'Buy', qty: 1, closedSize: 0, execTime: new Date(2026, 0, 5) });
    const pos = position({ id: 'p1', side: 'Sell', qty: 1, closedAt: new Date(2026, 0, 10) });

    // Passed in reverse order on purpose.
    const result = deriveLinearOpenedAt([newer, older], [pos]);

    expect(result.get('p1')).toEqual(older.execTime);
  });

  it('keeps symbols independent', () => {
    const btcOpen = fill({ symbol: 'BTCUSDT', side: 'Buy', qty: 1, closedSize: 0 });
    const ethOpen = fill({ symbol: 'ETHUSDT', side: 'Buy', qty: 1, closedSize: 0 });
    const btcPos = position({ id: 'pBtc', symbol: 'BTCUSDT', side: 'Sell', qty: 1 });
    const ethPos = position({ id: 'pEth', symbol: 'ETHUSDT', side: 'Sell', qty: 1 });

    const result = deriveLinearOpenedAt([btcOpen, ethOpen], [btcPos, ethPos]);

    expect(result.get('pBtc')).toEqual(btcOpen.execTime);
    expect(result.get('pEth')).toEqual(ethOpen.execTime);
  });

  it('ignores fills whose side is neither Buy nor Sell', () => {
    const bogus = fill({ side: 'Funding', qty: 1, closedSize: 0 });
    const pos = position({ id: 'p1', side: 'Sell', qty: 1 });

    const result = deriveLinearOpenedAt([bogus], [pos]);

    expect(result.has('p1')).toBe(false);
  });
});
