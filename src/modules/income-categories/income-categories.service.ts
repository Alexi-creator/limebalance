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
