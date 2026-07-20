import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { ExchangeAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BybitClient, type BybitCredentials } from './bybit.client';
import { decryptSecret } from './crypto.util';
import { deriveLinearOpenedAt } from './linear-fifo.util';
import { buildSpotClosedTrades } from './spot-fifo.util';

// Bybit limits one range query to 7 days; we step through history in such windows.
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Re-scan a little before the cursor so records landing exactly on the boundary are never
// skipped; upserts make the overlap harmless.
const OVERLAP_MS = 60 * 1000;
// Closed PnL exists only for derivatives; spot PnL is derived from fills (see spot-fifo.util).
const PNL_CATEGORY = 'linear';
const EXECUTION_CATEGORIES = ['linear', 'spot'];

@Injectable()
export class InvestingSyncService {
  private readonly logger = new Logger(InvestingSyncService.name);
  // The cron may tick while a long backfill is still running — skip instead of piling up.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bybit: BybitClient,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/2 * * * *')
  async syncAll() {
    if (this.running) return;
    if (!this.config.get<string>('ENCRYPTION_KEY')) return; // investing feature not configured

    this.running = true;
    try {
      // ERROR accounts are retried too: most failures (network, Bybit maintenance) are transient.
      const accounts = await this.prisma.exchangeAccount.findMany({
        where: { status: { in: ['ACTIVE', 'ERROR'] }, exchange: 'bybit' },
      });
      for (const account of accounts) {
        await this.syncAccount(account).catch((err) => {
          this.logger.warn(`Sync failed for account ${account.id}: ${err}`);
        });
      }
    } finally {
      this.running = false;
    }
  }

  async syncAccountById(id: string) {
    const account = await this.prisma.exchangeAccount.findUnique({ where: { id } });
    if (account) await this.syncAccount(account);
  }

  async syncAccount(account: ExchangeAccount) {
    const key = this.config.get<string>('ENCRYPTION_KEY');
    if (!key) throw new Error('ENCRYPTION_KEY is not configured');

    const creds: BybitCredentials = {
      apiKey: decryptSecret(account.apiKey, key),
      apiSecret: decryptSecret(account.apiSecret, key),
    };

    try {
      const now = new Date();
      await this.syncClosedPnl(account, creds, now);
      await this.syncExecutions(account, creds, now);
      await this.rebuildSpotPositions(account);
      await this.rebuildLinearOpenedAt(account);
      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: now, status: 'ACTIVE', lastError: null },
      });
    } catch (err) {
      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: { status: 'ERROR', lastError: String(err) },
      });
      throw err;
    }
  }

  private async syncClosedPnl(account: ExchangeAccount, creds: BybitCredentials, now: Date) {
    for (const window of this.windows(account.closedPnlSyncedTo, account.syncFrom, now)) {
      let cursor: string | undefined;
      do {
        const page = await this.bybit.getClosedPnl(creds, {
          category: PNL_CATEGORY,
          startTime: window.from.getTime(),
          endTime: window.to.getTime(),
          cursor,
        });
        for (const rec of page.list) {
          const data = {
            userId: account.userId,
            symbol: rec.symbol,
            category: PNL_CATEGORY,
            side: rec.side,
            qty: rec.qty,
            avgEntryPrice: rec.avgEntryPrice,
            avgExitPrice: rec.avgExitPrice,
            closedPnl: rec.closedPnl,
            leverage: rec.leverage || null,
            closedAt: new Date(Number(rec.updatedTime)),
            raw: rec as Prisma.InputJsonValue,
          };
          // update mirrors create: Bybit may re-send a record with refined values while
          // the closing order is still filling.
          await this.prisma.closedPosition.upsert({
            where: { accountId_orderId: { accountId: account.id, orderId: rec.orderId } },
            create: { accountId: account.id, orderId: rec.orderId, ...data },
            update: data,
          });
        }
        cursor = page.nextPageCursor || undefined;
      } while (cursor);

      // Advance the cursor after every finished window so an interrupted backfill resumes
      // where it stopped instead of starting over.
      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: { closedPnlSyncedTo: window.to },
      });
    }
  }

  private async syncExecutions(account: ExchangeAccount, creds: BybitCredentials, now: Date) {
    for (const window of this.windows(account.executionsSyncedTo, account.syncFrom, now)) {
      // One shared cursor field covers both categories: the window only advances after
      // every category has been fully paged through.
      for (const category of EXECUTION_CATEGORIES) {
        let cursor: string | undefined;
        do {
          const page = await this.bybit.getExecutions(creds, {
            category,
            startTime: window.from.getTime(),
            endTime: window.to.getTime(),
            cursor,
          });
          for (const rec of page.list) {
            const data = {
              userId: account.userId,
              orderId: rec.orderId,
              symbol: rec.symbol,
              category,
              side: rec.side,
              execType: rec.execType || 'Trade',
              price: rec.execPrice,
              qty: rec.execQty,
              fee: rec.execFee || 0,
              feeCurrency: rec.feeCurrency ?? null,
              execTime: new Date(Number(rec.execTime)),
              raw: rec as Prisma.InputJsonValue,
            };
            await this.prisma.tradeExecution.upsert({
              where: { accountId_execId: { accountId: account.id, execId: rec.execId } },
              create: { accountId: account.id, execId: rec.execId, ...data },
              update: data,
            });
          }
          cursor = page.nextPageCursor || undefined;
        } while (cursor);
      }

      await this.prisma.exchangeAccount.update({
        where: { id: account.id },
        data: { executionsSyncedTo: window.to },
      });
    }
  }

  // Bybit reports no realized PnL for spot, so closed spot trades are derived from the fills by
  // FIFO matching. Recomputed from the full fill history on every sync — stateless and
  // idempotent: each sell fill maps to a deterministic dedupe key, so re-runs upsert in place.
  private async rebuildSpotPositions(account: ExchangeAccount) {
    const fills = await this.prisma.tradeExecution.findMany({
      where: { accountId: account.id, category: 'spot' },
      orderBy: [{ execTime: 'asc' }, { createdAt: 'asc' }],
    });
    if (!fills.length) return;

    const trades = buildSpotClosedTrades(
      fills.map((f) => ({
        execId: f.execId,
        symbol: f.symbol,
        side: f.side,
        price: Number(f.price),
        qty: Number(f.qty),
        fee: Number(f.fee),
        feeCurrency: f.feeCurrency,
        execTime: f.execTime,
      })),
    );

    for (const trade of trades) {
      const data = {
        userId: account.userId,
        symbol: trade.symbol,
        category: 'spot',
        // Spot round trips are always long: bought first, sold later — Sell closes a long.
        side: 'Sell',
        qty: trade.qty,
        avgEntryPrice: trade.avgEntryPrice,
        avgExitPrice: trade.avgExitPrice,
        closedPnl: trade.closedPnl,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
      };
      await this.prisma.closedPosition.upsert({
        where: { accountId_orderId: { accountId: account.id, orderId: trade.dedupeKey } },
        create: { accountId: account.id, orderId: trade.dedupeKey, ...data },
        update: data,
      });
    }
  }

  // Bybit's Closed PnL records carry no open time for linear (derivatives) positions. Derived
  // from the fills' `closedSize` (in `raw`, see linear-fifo.util) — recomputed from the full
  // history on every sync, same idempotent-rebuild pattern as rebuildSpotPositions.
  private async rebuildLinearOpenedAt(account: ExchangeAccount) {
    const [fills, positions] = await Promise.all([
      this.prisma.tradeExecution.findMany({
        where: { accountId: account.id, category: 'linear', execType: { not: 'Funding' } },
        select: { symbol: true, side: true, qty: true, execTime: true, raw: true },
      }),
      this.prisma.closedPosition.findMany({
        where: { accountId: account.id, category: 'linear' },
        select: { id: true, symbol: true, side: true, qty: true, closedAt: true },
      }),
    ]);
    if (!fills.length || !positions.length) return;

    const openedAtById = deriveLinearOpenedAt(
      fills.map((f) => ({
        symbol: f.symbol,
        side: f.side,
        qty: Number(f.qty),
        closedSize: Number((f.raw as Record<string, unknown> | null)?.closedSize ?? 0),
        execTime: f.execTime,
      })),
      positions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        qty: Number(p.qty),
        closedAt: p.closedAt,
      })),
    );

    await Promise.all(
      positions
        .filter((p) => openedAtById.has(p.id))
        .map((p) =>
          this.prisma.closedPosition.update({
            where: { id: p.id },
            data: { openedAt: openedAtById.get(p.id) },
          }),
        ),
    );
  }

  // [from, to] windows of ≤ 7 days covering everything from the cursor (or syncFrom on the first
  // run) up to `now`, with a small overlap behind the cursor.
  private windows(syncedTo: Date | null, syncFrom: Date, now: Date): { from: Date; to: Date }[] {
    let start = syncedTo ? new Date(syncedTo.getTime() - OVERLAP_MS) : syncFrom;
    if (start < syncFrom) start = syncFrom;

    const result: { from: Date; to: Date }[] = [];
    while (start < now) {
      const end = new Date(Math.min(start.getTime() + WINDOW_MS, now.getTime()));
      result.push({ from: start, to: end });
      start = end;
    }
    return result;
  }
}
