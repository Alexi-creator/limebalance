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
import { BulkDeleteExpensesDto } from './dto/bulk-delete-expenses.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseResponseDto, ExpenseSummaryResponseDto } from './dto/expense-response.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Создать трату' })
  @ApiCreatedResponse({ type: ExpenseResponseDto, description: 'Без вложенной category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить траты пользователя' })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiOkResponse({ type: [ExpenseResponseDto], description: 'С вложенной category' })
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
    summary: 'Итог трат за период (бакеты по дню/неделе/месяцу)',
    description: 'Диапазон from/to + granularity (day|week|month). По умолчанию — текущий месяц.',
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

  @Get(':id')
  @ApiOperation({ summary: 'Получить трату по id' })
  @ApiOkResponse({ type: ExpenseResponseDto, description: 'С вложенной category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить трату' })
  @ApiOkResponse({ type: ExpenseResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, user.id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Массовое удаление трат' })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Количество удалённых записей',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteExpensesDto) {
    return this.expensesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить трату' })
  @ApiOkResponse({ type: ExpenseResponseDto, description: 'Удалённая запись, без category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.remove(id, user.id);
  }
}
