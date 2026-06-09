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
  @ApiOperation({
    summary: 'Создать трату',
    description:
      'Добавляет одну запись о расходе текущему пользователю: сумма, валюта, категория (по categoryId), ' +
      'дата операции (civil date — день без времени) и опц. комментарий. Категория должна принадлежать этому же пользователю. ' +
      'В ответе сама трата без вложенного объекта category (только categoryId).',
  })
  @ApiCreatedResponse({ type: ExpenseResponseDto, description: 'Без вложенной category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Список трат пользователя',
    description:
      'Возвращает все траты текущего пользователя, опционально отфильтрованные по диапазону дат операции. ' +
      'from/to — границы периода (включительно), обе опциональны: можно задать только from, только to или ничего (тогда всё). ' +
      'Каждая запись приходит с вложенным объектом category. Для постраничного вывода по доходам+расходам сразу см. GET /transactions.',
  })
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
    summary: 'Сводка трат за период',
    description:
      'Агрегирует траты за период в бакеты для графиков: суммы группируются по дню, неделе или месяцу (granularity). ' +
      'from/to задают период, granularity — шаг разбивки (day|week|month). Если ничего не передать — берётся текущий месяц по дням. ' +
      'Используйте для построения столбчатых/линейных диаграмм динамики расходов.',
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
  @ApiOperation({
    summary: 'Получить трату по id',
    description:
      'Возвращает одну трату по её id с вложенной category. Доступны только свои записи: ' +
      'чужой или несуществующий id → 404.',
  })
  @ApiOkResponse({ type: ExpenseResponseDto, description: 'С вложенной category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить трату',
    description:
      'Частично обновляет свою трату по id: можно менять сумму, валюту, категорию, дату или комментарий — ' +
      'присылайте только изменяемые поля. Новый categoryId должен принадлежать пользователю. Чужой id → 404.',
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
    summary: 'Массовое удаление трат',
    description:
      'Удаляет сразу несколько своих трат — в теле передаётся массив ids. Удаляются только записи, ' +
      'принадлежащие пользователю (чужие id просто игнорируются). В ответе — количество фактически удалённых записей. ' +
      'Для удаления одной траты есть DELETE /expenses/:id.',
  })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Количество удалённых записей',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteExpensesDto) {
    return this.expensesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить трату',
    description:
      'Удаляет одну свою трату по id. Чужой или несуществующий id → 404. ' +
      'В ответе — удалённая запись (без вложенной category).',
  })
  @ApiOkResponse({ type: ExpenseResponseDto, description: 'Удалённая запись, без category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.expensesService.remove(id, user.id);
  }
}
