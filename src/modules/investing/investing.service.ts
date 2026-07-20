import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExchangeAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient } from './bybit.client';
import { decryptSecret, encryptSecret } from './crypto.util';
import type { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';
import type { CreateHoldingDto, UpdateHoldingDto } from './dto/holding.dto';
import type { CreateManualPositionDto, UpdateManualPositionDto } from './dto/manual-position.dto';
import type { UpdateExchangeAccountDto } from './dto/update-exchange-account.dto';
import { InvestingSyncService } from './investing-sync.service';
import { PriceService } from './price.service';

const MAX_PAGE = 200;
// Bybit hard-rejects startTime older than 2 years ("Bybit error 10001: Can't query order
// earlier than 2 years") instead of just returning an empty page, so the whole sync fails if
// this isn't kept under that — a few days of margin absorbs any rounding on Bybit's side.
const MAX_HISTORY_MS = 729 * 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;

// All rows share the exchange convention: side is the CLOSING order's side.
const directionToSide = (direction: 'long' | 'short') => (direction === 'long' ? 'Sell' : 'Buy');
const sideToDirection = (side: string): 'long' | 'short' => (side === 'Sell' ? 'long' : 'short');

// PnL from prices when the user doesn't provide it (fees not included then).
const computePnl = (direction: 'long' | 'short', qty: number, entry: number, exit: number) =>
  direction === 'long' ? (exit - entry) * qty : (entry - exit) * qty;

type ListQuery = {
  accountId?: string;
  symbol?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

@Injectable()
export class InvestingService {
  private readonly logger = new Logger(InvestingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly sync: InvestingSyncService,
    private readonly prices: PriceService,
    private readonly config: ConfigService,
  ) {}

  async addAccount(userId: string, dto: CreateExchangeAccountDto) {
    const key = this.encryptionKey();

    // Reject broken/foreign keys immediately — a bad key must fail at connect time,
    // not silently in the background sync.
    let readOnly: boolean;
    try {
      ({ readOnly } = await this.bybit.validateKey({
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
      }));
    } catch (err) {
      this.logger.warn(`Bybit key validation failed for user ${userId}: ${err}`);
      throw new BadRequestException('Bybit rejected the API key. Check the key and secret.');
    }

    // The diary only ever reads, so a key with trade/withdraw permissions is pure liability —
    // refuse it outright rather than storing more power than we need.
    if (!readOnly) {
      throw new BadRequestException(
        'This API key has trade permissions. Create a read-only key on Bybit and connect that instead.',
      );
    }

    const account = await this.prisma.exchangeAccount.create({
      data: {
        userId,
        exchange: 'bybit',
        label: dto.label,
        apiKey: encryptSecret(dto.apiKey, key),
        apiSecret: encryptSecret(dto.apiSecret, key),
        // Backfill as much as Bybit will actually hand over, not just from registration.
        syncFrom: new Date(Date.now() - MAX_HISTORY_MS),
      },
    });

    // Backfill in the background; the UI sees progress via status/lastSyncAt.
    this.sync.syncAccountById(account.id).catch((err) => {
      this.logger.warn(`Initial sync failed for account ${account.id}: ${err}`);
    });

    return { ...this.sanitize(account), readOnly };
  }

  async listAccounts(userId: string) {
    const accounts = await this.prisma.exchangeAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((a) => this.sanitize(a));
  }

  async removeAccount(userId: string, id: string) {
    await this.findOwnAccount(userId, id);
    // Cascade wipes the synced executions/positions — reconnecting re-syncs them.
    await this.prisma.exchangeAccount.delete({ where: { id } });
    return { deleted: true };
  }

  async renameAccount(userId: string, id: string, dto: UpdateExchangeAccountDto) {
    await this.findOwnAccount(userId, id);
    const account = await this.prisma.exchangeAccount.update({
      where: { id },
      data: { label: dto.label },
    });
    return this.sanitize(account);
  }

  async syncNow(userId: string, id: string) {
    const account = await this.findOwnAccount(userId, id);
    await this.sync.syncAccount(account);
    return this.sanitize(await this.prisma.exchangeAccount.findUniqueOrThrow({ where: { id } }));
  }

  async getPositions(userId: string, query: ListQuery) {
    const where = this.buildWhere(userId, query, 'closedAt');
    const [rows, total] = await Promise.all([
      this.prisma.closedPosition.findMany({
        where,
        orderBy: { closedAt: 'desc' },
        take: Math.min(query.limit ?? 50, MAX_PAGE),
        skip: query.offset ?? 0,
      }),
      this.prisma.closedPosition.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (p) => {
        const notional = Number(p.qty) * Number(p.avgEntryPrice);
        const leverage = p.leverage ? Number(p.leverage) : 1;
        return {
          ...p,
          // Capital actually committed, in USDT — notional at entry price divided by leverage,
          // fees aside. 1x for spot/manual (no leverage).
          entryVolumeUsd: round2(notional / leverage),
          totalFeeUsd: await this.sumFees(p),
        };
      }),
    );
    return { items, total };
  }

  // Every fee (trading + funding) charged over the position's life, signed as Bybit reports it
  // (positive = paid, negative = rebate) — a plain sum reads as "net cost". Only computable for
  // synced positions with a known open time; manual entries and undated linear ones get null.
  private async sumFees(p: {
    source: string;
    accountId: string | null;
    symbol: string;
    category: string;
    openedAt: Date | null;
    closedAt: Date;
  }): Promise<number | null> {
    if (p.source !== 'bybit' || !p.accountId || !p.openedAt) return null;
    const agg = await this.prisma.tradeExecution.aggregate({
      where: {
        accountId: p.accountId,
        symbol: p.symbol,
        category: p.category,
        execTime: { gte: p.openedAt, lte: p.closedAt },
      },
      _sum: { fee: true },
    });
    return agg._sum.fee ? round2(Number(agg._sum.fee)) : 0;
  }

  async getTrades(userId: string, query: ListQuery) {
    const where = this.buildWhere(userId, query, 'execTime');
    // Funding-fee settlements are excluded from the fills themselves and rolled up into a
    // separate summary — they clutter the fill list (one row every 8h) and read as trades
    // (side Buy/Sell) even though no trading actually happened.
    const tradesWhere = { ...where, execType: { not: 'Funding' } };
    const fundingWhere = { ...where, execType: 'Funding' };

    const [items, total, fundingAgg] = await Promise.all([
      this.prisma.tradeExecution.findMany({
        where: tradesWhere,
        orderBy: { execTime: 'desc' },
        take: Math.min(query.limit ?? 50, MAX_PAGE),
        skip: query.offset ?? 0,
      }),
      this.prisma.tradeExecution.count({ where: tradesWhere }),
      this.prisma.tradeExecution.aggregate({
        where: fundingWhere,
        _sum: { fee: true },
        _count: true,
      }),
    ]);

    return {
      items,
      total,
      funding: {
        totalFee: fundingAgg._sum.fee ? Number(fundingAgg._sum.fee) : 0,
        count: fundingAgg._count,
      },
    };
  }

  // ─── Manual diary entries (trades outside connected exchanges) ───

  async addManualPosition(userId: string, dto: CreateManualPositionDto) {
    return this.prisma.closedPosition.create({
      data: {
        userId,
        source: 'manual',
        symbol: dto.symbol.toUpperCase(),
        category: 'manual',
        side: directionToSide(dto.direction),
        qty: dto.qty,
        avgEntryPrice: dto.entryPrice,
        avgExitPrice: dto.exitPrice,
        closedPnl:
          dto.closedPnl ?? computePnl(dto.direction, dto.qty, dto.entryPrice, dto.exitPrice),
        leverage: dto.leverage ?? null,
        openedAt: dto.openedAt ?? null,
        closedAt: dto.closedAt,
        raw: dto.venue ? { venue: dto.venue } : undefined,
      },
    });
  }

  async updateManualPosition(userId: string, id: string, dto: UpdateManualPositionDto) {
    const existing = await this.findOwnManualPosition(userId, id);

    const direction = dto.direction ?? sideToDirection(existing.side);
    const qty = dto.qty ?? Number(existing.qty);
    const entry = dto.entryPrice ?? Number(existing.avgEntryPrice);
    const exit = dto.exitPrice ?? Number(existing.avgExitPrice);
    // Explicit PnL wins; otherwise recompute only when an input actually changed —
    // an untouched trade must keep its (possibly hand-adjusted) PnL.
    const inputsChanged =
      dto.direction !== undefined ||
      dto.qty !== undefined ||
      dto.entryPrice !== undefined ||
      dto.exitPrice !== undefined;
    const closedPnl =
      dto.closedPnl ?? (inputsChanged ? computePnl(direction, qty, entry, exit) : undefined);

    return this.prisma.closedPosition.update({
      where: { id },
      data: {
        ...(dto.symbol !== undefined ? { symbol: dto.symbol.toUpperCase() } : {}),
        ...(dto.direction !== undefined ? { side: directionToSide(dto.direction) } : {}),
        ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
        ...(dto.entryPrice !== undefined ? { avgEntryPrice: dto.entryPrice } : {}),
        ...(dto.exitPrice !== undefined ? { avgExitPrice: dto.exitPrice } : {}),
        ...(closedPnl !== undefined ? { closedPnl } : {}),
        ...(dto.leverage !== undefined ? { leverage: dto.leverage } : {}),
        ...(dto.openedAt !== undefined ? { openedAt: dto.openedAt } : {}),
        ...(dto.closedAt !== undefined ? { closedAt: dto.closedAt } : {}),
      },
    });
  }

  async removeManualPosition(userId: string, id: string) {
    await this.findOwnManualPosition(userId, id);
    await this.prisma.closedPosition.delete({ where: { id } });
    return { deleted: true };
  }

  private async findOwnManualPosition(userId: string, id: string) {
    const position = await this.prisma.closedPosition.findFirst({ where: { id, userId } });
    if (!position) throw new NotFoundException(`Position ${id} not found`);
    if (position.source !== 'manual') {
      throw new BadRequestException(
        'Only manual entries can be edited or deleted; synced positions are managed by the exchange sync',
      );
    }
    return position;
  }

  // ─── Holdings (manually tracked portfolio) ───

  async addHolding(userId: string, dto: CreateHoldingDto) {
    return this.prisma.holding.create({
      data: {
        userId,
        asset: dto.asset.toUpperCase(),
        amount: dto.amount,
        avgBuyPrice: dto.avgBuyPrice ?? null,
        location: dto.location ?? '',
        note: dto.note ?? null,
      },
    });
  }

  // Holdings valued at current market prices. price/value/pnl are null when the asset has no
  // USDT ticker on Bybit or prices are temporarily unavailable.
  async listHoldings(userId: string) {
    const [holdings, prices] = await Promise.all([
      this.prisma.holding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prices.getUsdPrices(),
    ]);

    let totalValue = 0;
    const items = holdings.map((h) => {
      const price = prices ? this.prices.priceOf(h.asset, prices) : null;
      const amount = Number(h.amount);
      const avgBuy = h.avgBuyPrice !== null ? Number(h.avgBuyPrice) : null;
      const value = price !== null ? round2(amount * price) : null;
      if (value !== null) totalValue += value;
      return {
        ...h,
        price,
        value,
        pnlUsd: price !== null && avgBuy !== null ? round2((price - avgBuy) * amount) : null,
        pnlPct: price !== null && avgBuy !== null ? round2((price / avgBuy - 1) * 100) : null,
      };
    });

    return { items, totalValue: round2(totalValue) };
  }

  async updateHolding(userId: string, id: string, dto: UpdateHoldingDto) {
    await this.findOwnHolding(userId, id);
    return this.prisma.holding.update({
      where: { id },
      data: {
        ...(dto.asset !== undefined ? { asset: dto.asset.toUpperCase() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.avgBuyPrice !== undefined ? { avgBuyPrice: dto.avgBuyPrice } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  async removeHolding(userId: string, id: string) {
    await this.findOwnHolding(userId, id);
    await this.prisma.holding.delete({ where: { id } });
    return { deleted: true };
  }

  private async findOwnHolding(userId: string, id: string) {
    const holding = await this.prisma.holding.findFirst({ where: { id, userId } });
    if (!holding) throw new NotFoundException(`Holding ${id} not found`);
    return holding;
  }

  private buildWhere(userId: string, query: ListQuery, dateField: 'closedAt' | 'execTime') {
    return {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.symbol ? { symbol: query.symbol.toUpperCase() } : {}),
      ...(query.from || query.to ? { [dateField]: { gte: query.from, lte: query.to } } : {}),
    };
  }

  private async findOwnAccount(userId: string, id: string) {
    const account = await this.prisma.exchangeAccount.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException(`Exchange account ${id} not found`);
    return account;
  }

  private encryptionKey(): string {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Investing is not configured on this server (ENCRYPTION_KEY missing)',
      );
    }
    return key;
  }

  // Secrets never leave the server; the key is shown masked (last 4 chars) for recognition.
  private sanitize(account: ExchangeAccount) {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    let apiKeyMasked: string | null = null;
    if (key) {
      try {
        apiKeyMasked = `••••${decryptSecret(account.apiKey, key).slice(-4)}`;
      } catch {
        apiKeyMasked = null; // encryption key rotated — the account needs reconnecting
      }
    }
    return {
      id: account.id,
      exchange: account.exchange,
      label: account.label,
      status: account.status,
      lastError: account.lastError,
      apiKeyMasked,
      syncFrom: account.syncFrom,
      lastSyncAt: account.lastSyncAt,
      createdAt: account.createdAt,
    };
  }
}
