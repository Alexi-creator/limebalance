/** The externalId a transfer recorded from a P2P order carries — what ties the two together. */
export const p2pExternalId = (orderId: string) => `p2p:${orderId}`;

/** Bybit's P2P status for a completed order — the only one that moved money. */
export const P2P_DONE = 50;
