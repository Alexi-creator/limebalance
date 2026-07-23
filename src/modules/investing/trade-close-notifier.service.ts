import { Injectable, Logger } from '@nestjs/common';
import type { Position } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BotService } from '../../bot/bot.service';
import { Locale, resolveLocale, t } from '../../bot/i18n';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// "3 days 4 hours" (en) / "3 дня 4 часа" (ru) — kept in code rather than i18n JSON since Russian
// plural forms don't fit a single {{count}} placeholder. Only ru/en for now; anything else falls
// back to the en-style rendering.
function formatDuration(locale: Locale, ms: number): string {
  const totalHours = Math.floor(ms / HOUR_MS);
  const days = Math.floor(ms / DAY_MS);
  const hours = totalHours % 24;

  if (locale === 'ru') {
    const pluralRu = (n: number, one: string, few: string, many: string) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
      return many;
    };
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} ${pluralRu(days, 'день', 'дня', 'дней')}`);
    if (hours > 0 || days === 0) parts.push(`${hours} ${pluralRu(hours, 'час', 'часа', 'часов')}`);
    return parts.join(' ');
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days === 0) parts.push(`${hours}h`);
  return parts.join(' ');
}

const formatSigned = (value: number, digits = 2) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

// Position.side follows the exchange convention used throughout this module: it's the side of the
// CLOSING order, not the position's own direction (Sell closes a long, Buy closes a short) — see
// side.util.ts / investing.service.ts for the same rule applied elsewhere.
const closingSideToDirection = (side: string): 'long' | 'short' =>
  side === 'Sell' ? 'long' : 'short';

/**
 * Pushes a Telegram message when an exchange-synced (non-manual) trade closes, for users with
 * active investing access. Hooked into investing-sync.service.ts right after a sync tick.
 */
@Injectable()
export class TradeCloseNotifierService {
  private readonly logger = new Logger(TradeCloseNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly bot: BotService,
  ) {}

  /** Finds positions on this account that closed after `since` and notifies each one. */
  async notifyNewlyClosed(accountId: string, since: Date): Promise<void> {
    const positions = await this.prisma.position.findMany({
      where: { accountId, source: 'bybit', status: 'CLOSED', closedAt: { gt: since } },
    });
    for (const position of positions) {
      await this.notifyOne(position).catch((err) => {
        this.logger.warn(`Failed to notify closed position ${position.id}: ${err}`);
      });
    }
  }

  private async notifyOne(position: Position): Promise<void> {
    if (position.closedPnl === null || position.avgExitPrice === null) return; // defensive: shouldn't happen for CLOSED
    if (!(await this.subscriptions.hasInvestingAccess(position.userId))) return;

    const notional = Number(position.qty) * Number(position.avgEntryPrice);
    const leverage = position.leverage ? Number(position.leverage) : 1;
    // Capital actually committed — same basis as entryVolumeUsd in investing.service.ts, matching
    // what the user already sees in the diary (and what they confirmed ROI% should be based on).
    const entryVolumeUsd = notional / leverage;
    const pnl = Number(position.closedPnl);
    const roiPercent = entryVolumeUsd > 0 ? (pnl / entryVolumeUsd) * 100 : 0;
    const direction = closingSideToDirection(position.side);

    const payload = {
      symbol: position.symbol,
      category: position.category,
      side: position.side,
      direction, // 'long' | 'short' — already flipped from the exchange's closing-side convention
      qty: Number(position.qty),
      avgEntryPrice: Number(position.avgEntryPrice),
      avgExitPrice: Number(position.avgExitPrice),
      closedPnl: pnl,
      entryVolumeUsd: Math.round(entryVolumeUsd * 100) / 100,
      roiPercent: Math.round(roiPercent * 10) / 10,
      leverage: position.leverage ? Number(position.leverage) : null,
      openedAt: position.openedAt?.toISOString() ?? null,
      closedAt: position.closedAt?.toISOString() ?? null,
    } satisfies Record<string, unknown> as Prisma.InputJsonValue;

    // Also the bell entry (frontend can render its own card from payload). The unique constraint
    // on (userId, dedupeKey) is the dedupe gate for the push below: a P2002 here means this exact
    // closed position was already handled on an earlier sync tick.
    try {
      await this.prisma.notification.create({
        data: {
          userId: position.userId,
          type: 'trade_closed',
          dedupeKey: `trade_closed:${position.id}`,
          payload,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }

    if (!(await this.notifications.isBotPushEnabled(position.userId, 'trade_closed'))) return;

    const user = await this.prisma.user.findUnique({
      where: { id: position.userId },
      select: { telegramId: true, languageCode: true },
    });
    if (!user?.telegramId) return;

    const locale = resolveLocale(user.languageCode);
    const m = t(locale);

    const sideLabel = direction === 'long' ? m.tradeSideLong : m.tradeSideShort;
    const emoji = pnl >= 0 ? '🟢' : '🔴';

    const lines = [
      m.tradeClosedHeading(emoji, position.symbol, sideLabel),
      '',
      m.tradePnl(`${formatSigned(pnl)} USDT`),
      m.tradeRoi(`${formatSigned(roiPercent, 1)}%`),
    ];
    if (position.openedAt && position.closedAt) {
      const duration = formatDuration(
        locale,
        position.closedAt.getTime() - position.openedAt.getTime(),
      );
      lines.push(m.tradeDuration(duration));
    }
    lines.push(
      m.tradeEntryExit(position.avgEntryPrice.toString(), position.avgExitPrice.toString()),
    );

    await this.bot.pushMessage(user.telegramId, lines.join('\n'));
  }
}
