import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitApiError, BybitClient, type BybitP2pOrder } from './bybit.client';
import { decryptSecret } from './crypto.util';

/** Why the P2P history could not be read, as a code the client can explain in its own words. */
export const P2P_UNAVAILABLE = 'P2P_UNAVAILABLE';

const MAX_PAGE_SIZE = 50;

export type P2pStatus = 'DONE' | 'CANCELLED' | 'DISPUTE' | 'ACTIVE';

/** Bybit's numeric statuses folded into the four that change what the user can do with an order. */
function statusOf(code: number): P2pStatus {
  if (code === 50) return 'DONE';
  if (code === 40 || code === 80) return 'CANCELLED';
  if (code === 30 || code === 100 || code === 110) return 'DISPUTE';
  return 'ACTIVE';
}

/** The externalId a transfer recorded from a P2P order carries — what ties the two together. */
export const p2pExternalId = (orderId: string) => `p2p:${orderId}`;

/**
 * P2P orders, read straight from the exchange whenever the tab is opened. Nothing is stored: the
 * history is the exchange's, and the only thing the app adds to it is which orders have already
 * been recorded as a transfer — looked up by `externalId`, so the table can say so.
 *
 * Why it matters: buying USDT on P2P credits FUND without any deposit record, so the import in
 * InvestingMovementsService never sees it, and the coins would read as trading profit. Recording
 * the order as a transfer from the balance is how that money gets explained.
 */
@Injectable()
export class InvestingP2pService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, accountId: string, page = 1, size = 20) {
    const account = await this.prisma.exchangeAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException(`Exchange account ${accountId} not found`);

    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Investing is not configured on this server (ENCRYPTION_KEY missing)',
      );
    }
    const creds = {
      apiKey: decryptSecret(account.apiKey, key),
      apiSecret: decryptSecret(account.apiSecret, key),
    };

    let result: { count: number; items: BybitP2pOrder[] };
    try {
      result = await this.bybit.getP2pOrders(creds, {
        page: Math.max(1, page),
        size: Math.min(Math.max(1, size), MAX_PAGE_SIZE),
      });
    } catch (err) {
      // Almost always the key: no P2P permission, or an account Bybit does not open the P2P API
      // to. Said as a code with Bybit's own words beside it, so the tab can explain the fix
      // instead of failing blank.
      if (err instanceof BybitApiError) {
        throw new BadRequestException({
          code: P2P_UNAVAILABLE,
          retCode: err.retCode,
          message: err.message,
        });
      }
      throw err;
    }

    const orders = result.items ?? [];
    const venue = await this.prisma.investingVenue.findUnique({ where: { accountId } });
    const recorded = venue
      ? await this.prisma.investingTransfer.findMany({
          where: { venueId: venue.id, externalId: { in: orders.map((o) => p2pExternalId(o.id)) } },
          select: { id: true, externalId: true },
        })
      : [];
    const transferByOrder = new Map(recorded.map((r) => [r.externalId, r.id]));

    return {
      venueId: venue?.id ?? null,
      total: Number(result.count ?? orders.length),
      items: orders.map((o) => ({
        id: o.id,
        side: o.side === 0 ? ('BUY' as const) : ('SELL' as const),
        asset: o.tokenId,
        quantity: Number(o.quantity ?? o.notifyTokenQuantity ?? 0),
        fiatAmount: Number(o.amount),
        fiatCurrency: o.currencyId,
        price: Number(o.price),
        fee: o.fee ? Number(o.fee) : null,
        counterparty: o.targetNickName || null,
        status: statusOf(Number(o.status)),
        createdAt: new Date(Number(o.createDate)),
        transferId: transferByOrder.get(p2pExternalId(o.id)) ?? null,
      })),
    };
  }
}
