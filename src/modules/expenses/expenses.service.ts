import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({ data: { ...dto, userId } });
  }

  findAllByUser(userId: string, from?: Date, to?: Date) {
    return this.prisma.expense.findMany({
      where: {
        userId,
        ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.findOne(id);
    return this.prisma.expense.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.expense.delete({ where: { id } });
  }

  async statSummary(userId: string, categoryId: string | null, period: string) {
    const { from, to } = this.getPeriodDates(period);

    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { userId, ...(categoryId ? { categoryId } : {}), createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });

    const categories = await this.prisma.category.findMany({
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
    const expenses = await this.prisma.expense.findMany({
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
    for (const e of expenses) {
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
