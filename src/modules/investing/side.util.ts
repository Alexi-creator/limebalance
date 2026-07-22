// Bybit's position-list endpoint reports `side` as the position's own direction (Buy = long,
// Sell = short) — the opposite of the closed-pnl/manual-entry convention used throughout this
// module, where `side` is the side that closes (or will close) the position. Flipping at the
// sync boundary keeps every Position row readable with the same convention regardless of source.
export const flipSide = (side: string): string => (side === 'Buy' ? 'Sell' : 'Buy');
