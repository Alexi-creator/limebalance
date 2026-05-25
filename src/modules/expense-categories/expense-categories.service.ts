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

  async findOne(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`ExpenseCategory ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateExpenseCategoryDto) {
    await this.findOne(id);
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.expenseCategory.delete({ where: { id } });
  }
}
