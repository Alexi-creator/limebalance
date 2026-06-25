import { ForbiddenException, Injectable } from '@nestjs/common';
import { localWallClockNow } from '../../common/timezone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FREE_PLAN_NAME } from './subscriptions.constants';

/** Current usage against a single limit. `limit`/`remaining` are null when the plan is unlimited. */
export interface LimitUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The plan a user is effectively on right now: their subscribed plan if the subscription is
   * still active (no expiry, or expiry in the future), otherwise the free plan. Free is also the
   * fallback when there's no subscription row at all, so feature gating is always safe.
   */
  async getEffectivePlan(userId: string) {
    const sub = await this.prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const active = sub && (sub.expiresAt === null || sub.expiresAt > new Date());
    if (active) return sub.plan;
    return this.prisma.plan.findUniqueOrThrow({ where: { name: FREE_PLAN_NAME } });
  }

  async hasInvestingAccess(userId: string): Promise<boolean> {
    return (await this.getEffectivePlan(userId)).investingAccess;
  }

  /**
   * Current usage and remaining limits for the user's effective plan — for the frontend to warn
   * before the cap is hit. Categories are a lifetime total; transactions reset each calendar month.
   */
  async getUsage(userId: string): Promise<{ categories: LimitUsage; transactions: LimitUsage }> {
    const plan = await this.getEffectivePlan(userId);
    const [categoriesUsed, transactionsUsed] = await Promise.all([
      this.countCategories(userId),
      this.countTransactionsThisMonth(userId),
    ]);
    return {
      categories: toUsage(categoriesUsed, plan.maxCategories),
      transactions: toUsage(transactionsUsed, plan.maxTransactionsPerMonth),
    };
  }

  /**
   * Throws 403 if creating one more category would exceed the plan's total cap (expense + income
   * categories combined, lifetime). No-op when the plan is unlimited (maxCategories === null).
   */
  async assertCanAddCategory(userId: string): Promise<void> {
    const { maxCategories } = await this.getEffectivePlan(userId);
    if (maxCategories === null) return;
    if ((await this.countCategories(userId)) >= maxCategories) {
      throw new ForbiddenException(
        `Category limit reached (${maxCategories}). Upgrade your plan to add more.`,
      );
    }
  }

  /**
   * Throws 403 if creating one more transaction would exceed the plan's monthly cap (expenses +
   * incomes within the current calendar month, in the user's timezone). The window resets each
   * month. No-op when unlimited (maxTransactionsPerMonth === null). Counted by operation date, the
   * same notion of "month" the rest of the app uses for periods.
   */
  async assertCanAddTransaction(userId: string): Promise<void> {
    const { maxTransactionsPerMonth } = await this.getEffectivePlan(userId);
    if (maxTransactionsPerMonth === null) return;
    if ((await this.countTransactionsThisMonth(userId)) >= maxTransactionsPerMonth) {
      throw new ForbiddenException(
        `Monthly transaction limit reached (${maxTransactionsPerMonth}). Upgrade your plan or wait until next month.`,
      );
    }
  }

  /** Total categories the user has (expense + income), lifetime. */
  private async countCategories(userId: string): Promise<number> {
    const [expense, income] = await Promise.all([
      this.prisma.expenseCategory.count({ where: { userId } }),
      this.prisma.incomeCategory.count({ where: { userId } }),
    ]);
    return expense + income;
  }

  /** Transactions (expenses + incomes) dated within the current calendar month, in the user's tz. */
  private async countTransactionsThisMonth(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const now = localWallClockNow(user?.timezone ?? 'UTC');
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const where = { userId, date: { gte: monthStart, lt: nextMonth } };

    const [expenses, incomes] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.income.count({ where }),
    ]);
    return expenses + incomes;
  }
}

function toUsage(used: number, limit: number | null): LimitUsage {
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}
