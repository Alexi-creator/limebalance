import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateIncomeDto) {
    return this.prisma.income.create({ data: { ...dto, userId } });
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

  async findOne(id: string) {
    const income = await this.prisma.income.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!income) throw new NotFoundException(`Income ${id} not found`);
    return income;
  }

  async update(id: string, dto: UpdateIncomeDto) {
    await this.findOne(id);
    return this.prisma.income.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
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
