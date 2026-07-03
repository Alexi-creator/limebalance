import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FREE_PLAN_NAME } from '../subscriptions/subscriptions.constants';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';

// Flat, ready-to-render plan row. price is a Prisma Decimal — convert to number so JSON doesn't
// serialize it as a string. `subscribers` is every subscription row pointing at the plan (a lapsed
// subscription still points here until it's changed); `activeSubscribers` counts only those not yet
// expired — i.e. users actually getting the plan's functionality right now.
function toRow(
  plan: {
    id: string;
    name: string;
    maxCategories: number | null;
    maxTransactionsPerMonth: number | null;
    price: Prisma.Decimal;
    investingAccess: boolean;
    archivedAt: Date | null;
    _count: { subscriptions: number };
  },
  activeSubscribers: number,
) {
  return {
    id: plan.id,
    name: plan.name,
    maxCategories: plan.maxCategories,
    maxTransactionsPerMonth: plan.maxTransactionsPerMonth,
    price: plan.price.toNumber(),
    investingAccess: plan.investingAccess,
    archivedAt: plan.archivedAt,
    isArchived: plan.archivedAt !== null,
    subscribers: plan._count.subscriptions,
    activeSubscribers,
  };
}

const ROW_ARGS = {
  include: { _count: { select: { subscriptions: true } } },
} as const;

// A subscription is "active" when it has no expiry (lifetime) or expires in the future — the same
// rule getEffectivePlan uses to decide whether the user is really on the plan.
function activeSubscriptionWhere(now: Date): Prisma.UserSubscriptionWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

@Injectable()
export class AdminPlansService {
  constructor(private readonly prisma: PrismaService) {}

  // Cheapest first so the free tier leads and paid tiers follow in ascending order.
  async list() {
    // Active-subscriber counts for every plan in one grouped query, merged into the rows below.
    const [plans, activeGroups] = await Promise.all([
      this.prisma.plan.findMany({ ...ROW_ARGS, orderBy: { price: 'asc' } }),
      this.prisma.userSubscription.groupBy({
        by: ['planId'],
        where: activeSubscriptionWhere(new Date()),
        _count: { _all: true },
      }),
    ]);
    const activeByPlan = new Map(activeGroups.map((g) => [g.planId, g._count._all]));
    return plans.map((plan) => toRow(plan, activeByPlan.get(plan.id) ?? 0));
  }

  async create(dto: CreatePlanDto) {
    try {
      const plan = await this.prisma.plan.create({
        data: {
          name: dto.name,
          maxCategories: dto.maxCategories ?? null,
          maxTransactionsPerMonth: dto.maxTransactionsPerMonth ?? null,
          price: dto.price,
          investingAccess: dto.investingAccess ?? false,
        },
        ...ROW_ARGS,
      });
      // A just-created plan has no subscribers yet.
      return toRow(plan, 0);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A plan named "${dto.name}" already exists`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.getOrThrow(id);
    // Only touch fields the caller sent; a present-but-null limit means "unlimited".
    const data: Prisma.PlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.maxCategories !== undefined) data.maxCategories = dto.maxCategories;
    if (dto.maxTransactionsPerMonth !== undefined)
      data.maxTransactionsPerMonth = dto.maxTransactionsPerMonth;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.investingAccess !== undefined) data.investingAccess = dto.investingAccess;

    try {
      await this.prisma.plan.update({ where: { id }, data });
      return this.getOrThrow(id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A plan named "${dto.name}" already exists`);
      }
      throw e;
    }
  }

  // Pull a plan from sale without touching its subscribers: they keep the plan and its functionality
  // until their subscription expires, then fall back to free. The reversible alternative to delete.
  async setArchived(id: string, archived: boolean) {
    const plan = await this.getOrThrow(id);
    // Free is the fallback for every lapsed/free user and is attached to new signups — it must always
    // be offered, so it can't be archived.
    if (archived && plan.name === FREE_PLAN_NAME) {
      throw new ConflictException('The free plan cannot be archived');
    }
    await this.prisma.plan.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    return this.getOrThrow(id);
  }

  async remove(id: string) {
    const plan = await this.getOrThrow(id);
    // The free plan is the fallback every user drops to when their subscription lapses (and new
    // users are attached to it on signup) — deleting it would break plan resolution.
    if (plan.name === FREE_PLAN_NAME) {
      throw new ConflictException('The free plan cannot be deleted');
    }
    // Hard delete is only for plans nobody is on. To retire a plan that still has (possibly paid)
    // subscribers, archive it instead so their remaining time is honoured.
    if (plan.subscribers > 0) {
      throw new ConflictException(
        `Cannot delete "${plan.name}": ${plan.subscribers} user(s) are still on it. ` +
          'Archive it instead, or move them to another plan first.',
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return plan;
  }

  private async getOrThrow(id: string) {
    const [plan, activeSubscribers] = await Promise.all([
      this.prisma.plan.findUnique({ where: { id }, ...ROW_ARGS }),
      this.prisma.userSubscription.count({
        where: { planId: id, ...activeSubscriptionWhere(new Date()) },
      }),
    ]);
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return toRow(plan, activeSubscribers);
  }
}
