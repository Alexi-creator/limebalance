import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  async create(userId: string, dto: CreateIncomeDto) {
    const currency = dto.currency ?? (await this.resolveUserCurrency(userId));
    // Снапшот стоимости в USD по текущему курсу (фиксируется на момент создания).
    const amountUsd = await this.currency.convert(dto.amount, currency, 'USD');
    return this.prisma.income.create({ data: { ...dto, userId, currency, amountUsd } });
  }

  private async resolveUserCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    });
    return user?.currency ?? 'USD';
  }

  findAllByUser(userId: string, from?: Date, to?: Date) {
    return this.prisma.income.findMany({
      where: {
        userId,
        ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSummary(userId: string, months: number) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const incomes = await this.prisma.income.findMany({
      where: { userId, date: { gte: from, lte: to } },
      select: { amount: true, date: true },
    });

    const byMonthMap = new Map<string, number>();
    let total = 0;

    for (const e of incomes) {
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      byMonthMap.set(key, (byMonthMap.get(key) ?? 0) + Number(e.amount));
      total += Number(e.amount);
    }

    const byMonth: { month: string; total: string }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth.push({ month: key, total: (byMonthMap.get(key) ?? 0).toFixed(2) });
    }

    return { total: total.toFixed(2), byMonth };
  }

  async findOne(id: string, userId: string) {
    const income = await this.prisma.income.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (!income) throw new NotFoundException(`Income ${id} not found`);
    return income;
  }

  async update(id: string, userId: string, dto: UpdateIncomeDto) {
    const existing = await this.findOne(id, userId);

    // Пересчитываем USD-снапшот только если изменились сумма или валюта.
    let amountUsd: number | null | undefined;
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const amount = dto.amount ?? Number(existing.amount);
      const currency = dto.currency ?? existing.currency;
      amountUsd = await this.currency.convert(amount, currency, 'USD');
    }

    return this.prisma.income.update({
      where: { id },
      data: { ...dto, ...(amountUsd !== undefined ? { amountUsd } : {}) },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.income.delete({ where: { id } });
  }

  async statSummary(userId: string, categoryId: string | null, period: string) {
    const { from, to } = this.getPeriodDates(period);

    const grouped = await this.prisma.income.groupBy({
      by: ['categoryId'],
      where: { userId, ...(categoryId ? { categoryId } : {}), createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });

    const categories = await this.prisma.incomeCategory.findMany({
      where: { id: { in: grouped.map((g) => g.categoryId) } },
      select: { id: true, name: true },
    });

    const nameMap = new Map(categories.map((c) => [c.id, c.name]));

    return grouped.map((g) => ({
      category: nameMap.get(g.categoryId) ?? '—',
      total: Number(g._sum.amount ?? 0),
    }));
  }

  async statDetails(userId: string, categoryId: string | null, period: string) {
    const { from, to } = this.getPeriodDates(period);
    const incomes = await this.prisma.income.findMany({
      where: { userId, ...(categoryId ? { categoryId } : {}), createdAt: { gte: from, lte: to } },
      select: {
        amount: true,
        description: true,
        createdAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<
      string,
      { total: number; items: { date: Date; amount: number; description?: string }[] }
    >();
    for (const e of incomes) {
      const name = e.category?.name ?? '—';
      if (!map.has(name)) map.set(name, { total: 0, items: [] });
      const group = map.get(name);
      if (!group) continue;
      group.total += Number(e.amount);
      group.items.push({ date: e.createdAt, amount: Number(e.amount), description: e.description });
    }
    return Array.from(map.entries()).map(([category, data]) => ({ category, ...data }));
  }

  private getPeriodDates(period: string): { from: Date; to: Date } {
    const now = new Date();
    if (period === 'day') {
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
    }
    if (period === 'week') {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from, to: now };
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
}
