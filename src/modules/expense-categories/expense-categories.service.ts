import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: { ...dto, userId } });
  }

  findAllByUser(userId: string) {
    return this.prisma.expenseCategory.findMany({ where: { userId } });
  }

  async statsByCategory(userId: string, from?: Date, to?: Date) {
    const grouped = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categories = await this.prisma.expenseCategory.findMany({
      where: { userId },
      select: { id: true, name: true, emoji: true },
    });

    const statsMap = new Map(grouped.map((g) => [g.categoryId, g]));

    return categories.map((c) => {
      const stat = statsMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        total: Number(stat?._sum.amount ?? 0),
        count: stat?._count._all ?? 0,
      };
    });
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
