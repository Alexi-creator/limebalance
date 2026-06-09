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
  @ApiOperation({
    summary: 'Создать категорию расходов',
    description:
      'Создаёт пользовательскую категорию для группировки трат (например «Еда», «Транспорт»): имя и опц. оформление (иконка/цвет). ' +
      'Категории у каждого пользователя свои. На категорию потом ссылаются траты через categoryId.',
  })
  @ApiCreatedResponse({ type: ExpenseCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Список категорий расходов',
    description:
      'Возвращает все категории расходов текущего пользователя. Используйте, чтобы заполнить выпадающий список ' +
      'при создании/редактировании траты. Для сумм и количества по категориям см. GET /expense-categories/stats.',
  })
  @ApiOkResponse({ type: [ExpenseCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.expenseCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Статистика расходов по категориям',
    description:
      'Для каждой категории считает сумму и количество трат за период from/to (включая категории без трат — с нулями). ' +
      'Удобно для разбивки «куда уходят деньги» (pie/bar chart). ' +
      'Можно передать второй период compareFrom/compareTo для сравнения — тогда в ответе добавляются ' +
      'previousApproxTotal (итог за прошлый период) и deltaApproxTotal (изменение), чтобы показать рост/падение.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2025-12-31' })
  @ApiOkResponse({ type: [ExpenseCategoryStatDto], description: 'Все категории, включая пустые' })
  statsByCategory(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.expenseCategoriesService.statsByCategory(user.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      compareFrom: compareFrom ? new Date(compareFrom) : undefined,
      compareTo: compareTo ? new Date(compareTo) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить категорию расходов по id',
    description:
      'Возвращает одну свою категорию расходов по id. Чужой или несуществующий id → 404.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить категорию расходов',
    description:
      'Частично обновляет свою категорию (имя/оформление). Связанные траты остаются привязанными к ней. Чужой id → 404.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expenseCategoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить категорию расходов',
    description:
      'Удаляет свою категорию по id. Внимание: вместе с ней каскадно удаляются все траты этой категории. Чужой id → 404.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto, description: 'Удалённая категория' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.remove(id, user.id);
  }
}
