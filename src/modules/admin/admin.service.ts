import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChangePlanDto } from './dto/change-plan.dto';

// Everything the admin users table shows: account fields, login methods, current plan and the
// per-area activity counts. Shaped here (not selected raw) so BigInt telegramId never leaks and the
// frontend gets flat, ready-to-render rows.
function toRow(user: {
  id: string;
  email: string | null;
  name: string;
  role: string;
  currency: string;
  timezone: string;
  emailVerified: boolean;
  blockedAt: Date | null;
  createdAt: Date;
  telegramId: bigint | null;
  telegramUsername: string | null;
  googleId: string | null;
  password: string | null;
  subscription: { expiresAt: Date | null; plan: { name: string } } | null;
  _count: {
    expenseCategories: number;
    incomeCategories: number;
    expenses: number;
    incomes: number;
    goals: number;
  };
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    currency: user.currency,
    timezone: user.timezone,
    emailVerified: user.emailVerified,
    blockedAt: user.blockedAt,
    isBlocked: user.blockedAt !== null,
    createdAt: user.createdAt,
    // Login methods — booleans only, no secrets / raw ids.
    hasTelegram: user.telegramId !== null,
    telegramUsername: user.telegramUsername,
    hasGoogle: user.googleId !== null,
    hasPassword: user.password !== null,
    plan: user.subscription?.plan.name ?? null,
    planExpiresAt: user.subscription?.expiresAt ?? null,
    counts: {
      expenseCategories: user._count.expenseCategories,
      incomeCategories: user._count.incomeCategories,
      categories: user._count.expenseCategories + user._count.incomeCategories,
      expenses: user._count.expenses,
      incomes: user._count.incomes,
      transactions: user._count.expenses + user._count.incomes,
      goals: user._count.goals,
    },
  };
}

const ROW_ARGS = {
  include: {
    subscription: { select: { expiresAt: true, plan: { select: { name: true } } } },
    _count: {
      select: {
        expenseCategories: true,
        incomeCategories: true,
        expenses: true,
        incomes: true,
        goals: { where: { archived: false } },
      },
    },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      ...ROW_ARGS,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toRow);
  }

  private async getRowOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, ...ROW_ARGS });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return toRow(user);
  }

  async setBlocked(id: string, blocked: boolean) {
    await this.assertExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { blockedAt: blocked ? new Date() : null },
    });
    return this.getRowOrThrow(id);
  }

  async changePlan(id: string, dto: ChangePlanDto) {
    await this.assertExists(id);
    const plan = await this.prisma.plan.findUnique({ where: { name: dto.planName } });
    if (!plan) throw new NotFoundException(`Plan "${dto.planName}" not found`);

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    await this.prisma.userSubscription.upsert({
      where: { userId: id },
      update: { planId: plan.id, expiresAt },
      create: { userId: id, planId: plan.id, expiresAt },
    });
    return this.getRowOrThrow(id);
  }

  async remove(id: string) {
    const row = await this.getRowOrThrow(id);
    // Cascades to all of the user's data (expenses, income, categories, tokens, goals, etc.).
    await this.prisma.user.delete({ where: { id } });
    return row;
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`User ${id} not found`);
  }
}
