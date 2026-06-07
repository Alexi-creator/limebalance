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
  @ApiOperation({ summary: 'Создать категорию доходов' })
  @ApiCreatedResponse({ type: IncomeCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeCategoryDto) {
    return this.incomeCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все категории доходов пользователя' })
  @ApiOkResponse({ type: [IncomeCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.incomeCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Суммы и количество доходов по категориям',
    description:
      'compareFrom/compareTo — опц. предыдущий период; тогда в ответе previousApproxTotal и deltaApproxTotal.',
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
  @ApiOperation({ summary: 'Получить категорию доходов по id' })
  @ApiOkResponse({ type: IncomeCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить категорию доходов' })
  @ApiOkResponse({ type: IncomeCategoryResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateIncomeCategoryDto,
  ) {
    return this.incomeCategoriesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить категорию доходов' })
  @ApiOkResponse({ type: IncomeCategoryResponseDto, description: 'Удалённая категория' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.remove(id, user.id);
  }
}
