import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { endOfDay, resolveSummaryRange } from '../currency/summary.util';
import { BulkDeleteExpensesDto } from './dto/bulk-delete-expenses.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  ExpenseResponseDto,
  ExpenseStatResponseDto,
  ExpenseSummaryResponseDto,
} from './dto/expense-response.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an expense',
    description:
      'Adds a single expense record for the current user: amount, currency, category (by categoryId), ' +
      'operation date (a civil date — a day without time) and an optional comment. The category must belong to the same user. ' +
      'The response is the expense itself without a nested category object (only categoryId).',
  })
  @ApiCreatedResponse({ type: ExpenseResponseDto, description: 'Without a nested category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: "User's expense list",
    description:
      "Returns all of the current user's expenses, optionally filtered by an operation date range. " +
      'from/to are the period bounds (inclusive), both optional: you can set only from, only to, or neither (then everything). ' +
      'Each record comes with a nested category object. For a paginated income+expense feed see GET /transactions.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiOkResponse({ type: [ExpenseResponseDto], description: 'With a nested category' })
  findAll(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expensesService.findAllByUser(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Expense summary for a period',
    description:
      'Aggregates expenses over a period into buckets for charts: amounts grouped by day, week or month (granularity). ' +
      'from/to set the period, granularity is the bucket step (day|week|month). If nothing is passed — the current month by days is used. ' +
      'Use it to build bar/line charts of expense dynamics.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-30' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiOkResponse({ type: ExpenseSummaryResponseDto })
  summary(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.expensesService.getSummary(user.id, resolveSummaryRange({ from, to, granularity }));
  }

  @Get('stat')
  @ApiOperation({
    summary: 'Expense statistics for a period (same as the Telegram bot)',
    description:
      'Everything in one response: the overall total, per-category totals and the operation details. ' +
      'period — day (today), week (last 7 days) or month (current month, default); the bounds are computed ' +
      "in the user's timezone. Alternatively pass an explicit from/to date range (inclusive, either bound " +
      'may be omitted) — it takes precedence over period. categoryId optionally narrows the stats to a ' +
      "single category. Category and overall totals are converted to the user's base currency at the " +
      'current rate (null if rates are unavailable); each operation keeps its original currency.',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'from', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-30' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiOkResponse({ type: ExpenseStatResponseDto })
  stat(
    @CurrentUser() user: { id: string },
    @Query('period') period?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expensesService.statDetails(
      user.id,
      categoryId ?? null,
      period ?? 'month',
      from || to
        ? { from: from ? new Date(from) : undefined, to: to ? endOfDay(to) : undefined }
        : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an expense by id',
    description:
      'Returns one expense by its id with a nested category. Only your own records are accessible: ' +
      'a foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ type: ExpenseResponseDto, description: 'With a nested category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an expense',
    description:
      'Partially updates your expense by id: you can change amount, currency, category, date or comment — ' +
      'send only the fields being changed. A new categoryId must belong to the user. A foreign id → 404.',
  })
  @ApiOkResponse({ type: ExpenseResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, user.id, dto);
  }

  @Delete()
  @ApiOperation({
    summary: 'Bulk delete expenses',
    description:
      'Deletes several of your expenses at once — the body carries an array of ids. Only records ' +
      'belonging to the user are deleted (foreign ids are simply ignored). The response is the number of records actually deleted. ' +
      'To delete a single expense use DELETE /expenses/:id.',
  })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Number of deleted records',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteExpensesDto) {
    return this.expensesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an expense',
    description:
      'Deletes one of your expenses by id. A foreign or non-existent id → 404. ' +
      'The response is the deleted record (without a nested category).',
  })
  @ApiOkResponse({
    type: ExpenseResponseDto,
    description: 'The deleted record, without a category',
  })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.remove(id, user.id);
  }
}
