import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateIncomeCategoryDto } from './dto/create-income-category.dto';
import { UpdateIncomeCategoryDto } from './dto/update-income-category.dto';
import { IncomeCategoriesService } from './income-categories.service';

@ApiTags('income-categories')
@Controller('income-categories')
export class IncomeCategoriesController {
  constructor(private readonly incomeCategoriesService: IncomeCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать категорию доходов' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeCategoryDto) {
    return this.incomeCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все категории доходов пользователя' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.incomeCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Суммы и количество доходов по категориям' })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  statsByCategory(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomeCategoriesService.statsByCategory(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить категорию доходов по id' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить категорию доходов' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateIncomeCategoryDto,
  ) {
    return this.incomeCategoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить категорию доходов' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.remove(id, user.id);
  }
}
