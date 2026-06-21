import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { NotificationDto, NotificationsResponseDto } from './dto/notification-response.dto';

interface CurrencyGroup {
  currency: string;
  amount: number;
  amountUsd: number | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  /**
   * Fetched on entry. Recomputes the current-month summary (so fresh income/expense changes show up)
   * and returns all notifications for the user, newest first, plus the unread count for the badge.
   */
  async list(userId: string): Promise<NotificationsResponseDto> {
    await this.generateMonthlySummary(userId);

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const items: NotificationDto[] = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      payload: n.payload ?? null,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));

    const unreadCount = items.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0);
    return { items, unreadCount };
  }

  /** Marks a single notification read. No-op (count unchanged) if it isn't the user's or already read. */
  async markRead(userId: string, id: string): Promise<{ unreadCount: number }> {
    await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { unreadCount: await this.unreadCount(userId) };
  }

  /** "Mark all as read" — marks every unread notification of the user read. */
  async markAllRead(userId: string): Promise<{ unreadCount: number }> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { unreadCount: 0 };
  }

  private unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /**
   * Computes the income / expense / net for the current calendar month (UTC) plus the top expense
   * category, then upserts a single "monthly_summary:YYYY-MM" notification. Re-running refreshes the
   * numbers without touching isRead, so a summary the user already read stays read.
   */
  private async generateMonthlySummary(userId: string): Promise<void> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-based
    const monthStart = new Date(Date.UTC(year, month, 1));
    const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
    const period = `${year}-${String(month + 1).padStart(2, '0')}`;
    const dateRange = { gte: monthStart, lt: nextMonthStart };

    const [incomeGroups, expenseGroups, user, rates, topExpenseGroup] = await Promise.all([
      this.prisma.income.groupBy({
        by: ['currency'],
        where: { userId, date: dateRange },
        _sum: { amount: true, amountUsd: true },
      }),
      this.prisma.expense.groupBy({
        by: ['currency'],
        where: { userId, date: dateRange },
        _sum: { amount: true, amountUsd: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { userId, date: dateRange },
        _sum: { amountUsd: true },
        orderBy: { _sum: { amountUsd: 'desc' } },
        take: 1,
      }),
    ]);

    // Nothing happened this month yet — don't create an empty card.
    if (incomeGroups.length === 0 && expenseGroups.length === 0) return;

    const toRows = (groups: typeof incomeGroups): CurrencyGroup[] =>
      groups.map((g) => ({
        currency: g.currency,
        amount: Number(g._sum.amount ?? 0),
        amountUsd: g._sum.amountUsd != null ? Number(g._sum.amountUsd) : null,
      }));

    const baseCurrency = user?.currency ?? 'USD';
    const income = this.currency.approxTotalInBase(
      toRows(incomeGroups),
      baseCurrency,
      rates,
      'income',
    );
    const expense = this.currency.approxTotalInBase(
      toRows(expenseGroups),
      baseCurrency,
      rates,
      'expense',
    );
    const net =
      income !== null && expense !== null ? Math.round((income - expense) * 100) / 100 : null;

    let topCategory: { name: string; emoji: string | null } | null = null;
    const topCategoryId = topExpenseGroup[0]?.categoryId;
    if (topCategoryId) {
      const cat = await this.prisma.expenseCategory.findUnique({
        where: { id: topCategoryId },
        select: { name: true, emoji: true },
      });
      if (cat) topCategory = { name: cat.name, emoji: cat.emoji };
    }

    const payload = {
      period,
      baseCurrency,
      income,
      expense,
      net,
      topCategory,
    } as Prisma.InputJsonValue;

    const dedupeKey = `monthly_summary:${period}`;
    await this.prisma.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      // Refresh content only — isRead/readAt are intentionally left as they are.
      // title/body are omitted: the frontend localizes from `payload`.
      update: { payload },
      create: { userId, type: 'monthly_summary', dedupeKey, payload },
    });
  }
}
