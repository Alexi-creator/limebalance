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
    summary: 'Create an expense category',
    description:
      'Creates a user-defined category for grouping expenses (e.g. "Food", "Transport"): a name and optional styling (icon/color). ' +
      'Categories are per-user. Expenses later reference a category via categoryId.',
  })
  @ApiCreatedResponse({ type: ExpenseCategoryResponseDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List expense categories',
    description:
      "Returns all of the current user's expense categories. Use it to populate a dropdown " +
      'when creating/editing an expense. For per-category sums and counts see GET /expense-categories/stats.',
  })
  @ApiOkResponse({ type: [ExpenseCategoryResponseDto] })
  findAll(@CurrentUser() user: { id: string }) {
    return this.expenseCategoriesService.findAllByUser(user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Expense statistics by category',
    description:
      'For each category, computes the sum and count of expenses over the from/to period (including categories with no expenses — as zeros). ' +
      'Handy for a "where the money goes" breakdown (pie/bar chart). ' +
      'You can pass a second period compareFrom/compareTo for comparison — then the response adds ' +
      "previousApproxTotal (the previous period's total) and deltaApproxTotal (the change) to show growth/decline.",
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'compareFrom', required: false, example: '2025-01-01' })
  @ApiQuery({ name: 'compareTo', required: false, example: '2025-12-31' })
  @ApiOkResponse({
    type: [ExpenseCategoryStatDto],
    description: 'All categories, including empty ones',
  })
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
    summary: 'Get an expense category by id',
    description:
      'Returns one of your own expense categories by id. A foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an expense category',
    description:
      'Partially updates your category (name/styling). Linked expenses stay attached to it. A foreign id → 404.',
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
    summary: 'Delete an expense category',
    description:
      'Deletes your category by id. Warning: all expenses in this category are cascade-deleted with it. A foreign id → 404.',
  })
  @ApiOkResponse({ type: ExpenseCategoryResponseDto, description: 'The deleted category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expenseCategoriesService.remove(id, user.id);
  }
}
