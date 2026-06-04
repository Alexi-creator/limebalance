import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import {
  ExpenseCategoryResponseDto,
  ExpenseCategoryStatDto,
} from './dto/expense-category-response.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@ApiTags('expense-categories')
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly expenseCategoriesService: ExpenseCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать категорию расходов' })
  @ApiCreatedResponse({ type: ExpenseCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все категории расходов пользователя' })
  @ApiOkResponse({ type: [ExpenseCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.expenseCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Суммы и количество расходов по категориям' })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiOkResponse({ type: [ExpenseCategoryStatDto], description: 'Все категории, включая пустые' })
  statsByCategory(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expenseCategoriesService.statsByCategory(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить категорию расходов по id' })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить категорию расходов' })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expenseCategoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить категорию расходов' })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto, description: 'Удалённая категория' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.remove(id, user.id);
  }
}
