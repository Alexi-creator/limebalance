import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FREE_PLAN_NAME } from './subscriptions.constants';

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
}
