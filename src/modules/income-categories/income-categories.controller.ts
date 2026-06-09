import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateIncomeCategoryDto } from './dto/create-income-category.dto';
import {
  IncomeCategoryResponseDto,
  IncomeCategoryStatDto,
} from './dto/income-category-response.dto';
import { UpdateIncomeCategoryDto } from './dto/update-income-category.dto';
import { IncomeCategoriesService } from './income-categories.service';

@ApiTags('income-categories')
@Controller('income-categories')
export class IncomeCategoriesController {
  constructor(private readonly incomeCategoriesService: IncomeCategoriesService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать категорию доходов',
    description:
      'Создаёт пользовательскую категорию для группировки доходов (например «Зарплата», «Фриланс»): имя и опц. оформление (иконка/цвет). ' +
      'Категории у каждого пользователя свои. На категорию потом ссылаются доходы через categoryId.',
  })
  @ApiCreatedResponse({ type: IncomeCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeCategoryDto) {
    return this.incomeCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Список категорий доходов',
    description:
      'Возвращает все категории доходов текущего пользователя. Используйте, чтобы заполнить выпадающий список ' +
      'при создании/редактировании дохода. Для сумм и количества по категориям см. GET /income-categories/stats.',
  })
  @ApiOkResponse({ type: [IncomeCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.incomeCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Статистика доходов по категориям',
    description:
      'Для каждой категории считает сумму и количество доходов за период from/to (включая категории без доходов — с нулями). ' +
      'Удобно для разбивки «откуда приходят деньги» (pie/bar chart). ' +
      'Можно передать второй период compareFrom/compareTo для сравнения — тогда в ответе добавляются ' +
      'previousApproxTotal (итог за прошлый период) и deltaApproxTotal (изменение), чтобы показать рост/падение.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2025-12-31' })
  @ApiOkResponse({ type: [IncomeCategoryStatDto], description: 'Все категории, включая пустые' })
  statsByCategory(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compareFrom') compareFrom?: string,
    @Query('compareTo') compareTo?: string,
  ) {
    return this.incomeCategoriesService.statsByCategory(user.id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      compareFrom: compareFrom ? new Date(compareFrom) : undefined,
      compareTo: compareTo ? new Date(compareTo) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Получить категорию доходов по id',
    description: 'Возвращает одну свою категорию доходов по id. Чужой или несуществующий id → 404.',
  })
  @ApiOkResponse({ type: IncomeCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить категорию доходов',
    description:
      'Частично обновляет свою категорию (имя/оформление). Связанные доходы остаются привязанными к ней. Чужой id → 404.',
  })
  @ApiOkResponse({ type: IncomeCategoryResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateIncomeCategoryDto,
  ) {
    return this.incomeCategoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить категорию доходов',
    description:
      'Удаляет свою категорию по id. Внимание: вместе с ней каскадно удаляются все доходы этой категории. Чужой id → 404.',
  })
  @ApiOkResponse({ type: IncomeCategoryResponseDto, description: 'Удалённая категория' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.remove(id, user.id);
  }
}
