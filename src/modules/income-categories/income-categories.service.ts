import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIncomeCategoryDto } from './dto/create-income-category.dto';
import { UpdateIncomeCategoryDto } from './dto/update-income-category.dto';

@Injectable()
export class IncomeCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateIncomeCategoryDto) {
    return this.prisma.incomeCategory.create({ data: { ...dto, userId } });
  }

  findAllByUser(userId: string) {
    return this.prisma.incomeCategory.findMany({ where: { userId } });
  }

  async statsByCategory(userId: string, from?: Date, to?: Date) {
    const grouped = await this.prisma.income.groupBy({
      by: ['categoryId'],
      where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categories = await this.prisma.incomeCategory.findMany({
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

  async findOne(id: string) {
    const category = await this.prisma.incomeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`IncomeCategory ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateIncomeCategoryDto) {
    await this.findOne(id);
    return this.prisma.incomeCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.incomeCategory.delete({ where: { id } });
  }
}
