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
    summary: 'Create an income category',
    description:
      'Creates a user-defined category for grouping income (e.g. "Salary", "Freelance"): a name and optional styling (icon/color). ' +
      'Categories are per-user. Income entries later reference a category via categoryId.',
  })
  @ApiCreatedResponse({ type: IncomeCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeCategoryDto) {
    return this.incomeCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List income categories',
    description:
      "Returns all of the current user's income categories. Use it to populate a dropdown " +
      'when creating/editing an income entry. For per-category sums and counts see GET /income-categories/stats.',
  })
  @ApiOkResponse({ type: [IncomeCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.incomeCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Income statistics by category',
    description:
      'For each category, computes the sum and count of income over the from/to period (including categories with no income — as zeros). ' +
      'Handy for a "where the money comes from" breakdown (pie/bar chart). ' +
      'You can pass a second period compareFrom/compareTo for comparison — then the response adds ' +
      "previousApproxTotal (the previous period's total) and deltaApproxTotal (the change) to show growth/decline.",
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2025-12-31' })
  @ApiOkResponse({
    type: [IncomeCategoryStatDto],
    description: 'All categories, including empty ones',
  })
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
    summary: 'Get an income category by id',
    description:
      'Returns one of your own income categories by id. A foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ type: IncomeCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an income category',
    description:
      'Partially updates your category (name/styling). Linked income entries stay attached to it. A foreign id → 404.',
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
    summary: 'Delete an income category',
    description:
      'Deletes your category by id. Warning: all income entries in this category are cascade-deleted with it. A foreign id → 404.',
  })
  @ApiOkResponse({ type: IncomeCategoryResponseDto, description: 'The deleted category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomeCategoriesService.remove(id, user.id);
  }
}
