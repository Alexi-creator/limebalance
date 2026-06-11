import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  create(userId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: { ...dto, userId } });
  }

  findAllByUser(userId: string) {
    return this.prisma.expenseCategory.findMany({ where: { userId } });
  }

  async statsByCategory(
    userId: string,
    range: { from?: Date; to?: Date; compareFrom?: Date; compareTo?: Date } = {},
  ) {
    const { from, to, compareFrom, compareTo } = range;
    const compare = compareFrom !== undefined || compareTo !== undefined;

    const [categories, user, rates, current, previous] = await Promise.all([
      this.prisma.expenseCategory.findMany({
        where: { userId },
        select: { id: true, name: true, emoji: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
      this.groupByCategory(userId, from, to),
      compare ? this.groupByCategory(userId, compareFrom, compareTo) : Promise.resolve(null),
    ]);

    const baseCurrency = user?.currency ?? 'USD';

    return categories.map((c) => {
      const groups = current.get(c.id) ?? [];
      const approxTotal = this.currency.approxTotalInBase(groups, baseCurrency, rates, 'expense');
      const base = {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        count: groups.reduce((sum, g) => sum + g.count, 0),
        // Точная разбивка по валютам (разные валюты не складываем).
        totals: groups.map((g) => ({ currency: g.currency, total: g.amount, count: g.count })),
        baseCurrency,
        // Приблизительная сумма в базовой валюте через USD-снапшот.
        approxTotal,
      };

      if (!previous) return base;

      // Сравнение с предыдущим периодом: итог прошлого периода и дельта в базовой валюте.
      const prevGroups = previous.get(c.id) ?? [];
      const previousApproxTotal = this.currency.approxTotalInBase(prevGroups, baseCurrency, rates, 'expense');
      const deltaApproxTotal =
        approxTotal === null || previousApproxTotal === null
          ? null
          : Math.round((approxTotal - previousApproxTotal) * 100) / 100;
      return { ...base, previousApproxTotal, deltaApproxTotal };
    });
  }

  // categoryId -> разбивка по валютам за период: сумма + кол-во + USD-снапшот (для approx).
  private async groupByCategory(userId: string, from?: Date, to?: Date) {
    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId', 'currency'],
      where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
      _sum: { amount: true, amountUsd: true },
      _count: { _all: true },
    });

    const map = new Map<
      string,
      { currency: string; amount: number; count: number; amountUsd: number | null }[]
    >();
    for (const g of grouped) {
      const list = map.get(g.categoryId) ?? [];
      list.push({
        currency: g.currency,
        amount: Number(g._sum.amount ?? 0),
        count: g._count._all,
        amountUsd: g._sum.amountUsd != null ? Number(g._sum.amountUsd) : null,
      });
      map.set(g.categoryId, list);
    }
    return map;
  }

  async findOne(id: string, userId: string) {
    const category = await this.prisma.expenseCategory.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException(`ExpenseCategory ${id} not found`);
    return category;
  }

  async update(id: string, userId: string, dto: UpdateExpenseCategoryDto) {
    await this.findOne(id, userId);
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.expenseCategory.delete({ where: { id } });
  }
}
