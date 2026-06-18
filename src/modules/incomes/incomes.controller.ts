import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { resolveSummaryRange } from '../currency/summary.util';
import { BulkDeleteIncomesDto } from './dto/bulk-delete-incomes.dto';
import { CreateIncomeDto } from './dto/create-income.dto';
import { IncomeResponseDto, IncomeSummaryResponseDto } from './dto/income-response.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';
import { IncomesService } from './incomes.service';

@ApiTags('incomes')
@Controller('incomes')
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an income entry',
    description:
      'Adds a single income record for the current user: amount, currency, category (by categoryId), ' +
      'operation date (a civil date — a day without time) and an optional comment. The category must belong to the same user. ' +
      'The response is the income itself without a nested category object (only categoryId).',
  })
  @ApiCreatedResponse({ type: IncomeResponseDto, description: 'Without a nested category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeDto) {
    return this.incomesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: "User's income list",
    description:
      "Returns all of the current user's income entries, optionally filtered by an operation date range. " +
      'from/to are the period bounds (inclusive), both optional: you can set only from, only to, or neither (then everything). ' +
      'Each record comes with a nested category object. For a paginated income+expense feed see GET /transactions.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiOkResponse({ type: [IncomeResponseDto], description: 'With a nested category' })
  findAll(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomesService.findAllByUser(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Income summary for a period',
    description:
      'Aggregates income over a period into buckets for charts: amounts grouped by day, week or month (granularity). ' +
      'from/to set the period, granularity is the bucket step (day|week|month). If nothing is passed — the current month by days is used. ' +
      'Use it to build bar/line charts of income dynamics.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-30' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiOkResponse({ type: IncomeSummaryResponseDto })
  summary(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: string,
  ) {
    return this.incomesService.getSummary(user.id, resolveSummaryRange({ from, to, granularity }));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an income entry by id',
    description:
      'Returns one income entry by its id with a nested category. Only your own records are accessible: ' +
      'a foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'With a nested category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an income entry',
    description:
      'Partially updates your income entry by id: you can change amount, currency, category, date or comment — ' +
      'send only the fields being changed. A new categoryId must belong to the user. A foreign id → 404.',
  })
  @ApiOkResponse({ type: IncomeResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
  ) {
    return this.incomesService.update(id, user.id, dto);
  }

  @Delete()
  @ApiOperation({
    summary: 'Bulk delete income entries',
    description:
      'Deletes several of your income entries at once — the body carries an array of ids. Only records ' +
      'belonging to the user are deleted (foreign ids are simply ignored). The response is the number of records actually deleted. ' +
      'To delete a single income entry use DELETE /incomes/:id.',
  })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Number of deleted records',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteIncomesDto) {
    return this.incomesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an income entry',
    description:
      'Deletes one of your income entries by id. A foreign or non-existent id → 404. ' +
      'The response is the deleted record (without a nested category).',
  })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'The deleted record, without a category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.remove(id, user.id);
  }
}
