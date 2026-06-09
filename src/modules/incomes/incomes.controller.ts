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
    summary: 'Создать доход',
    description:
      'Добавляет одну запись о доходе текущему пользователю: сумма, валюта, категория (по categoryId), ' +
      'дата операции (civil date — день без времени) и опц. комментарий. Категория должна принадлежать этому же пользователю. ' +
      'В ответе сам доход без вложенного объекта category (только categoryId).',
  })
  @ApiCreatedResponse({ type: IncomeResponseDto, description: 'Без вложенной category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeDto) {
    return this.incomesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Список доходов пользователя',
    description:
      'Возвращает все доходы текущего пользователя, опционально отфильтрованные по диапазону дат операции. ' +
      'from/to — границы периода (включительно), обе опциональны: можно задать только from, только to или ничего (тогда всё). ' +
      'Каждая запись приходит с вложенным объектом category. Для постраничного вывода по доходам+расходам сразу см. GET /transactions.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  @ApiOkResponse({ type: [IncomeResponseDto], description: 'С вложенной category' })
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
    summary: 'Сводка доходов за период',
    description:
      'Агрегирует доходы за период в бакеты для графиков: суммы группируются по дню, неделе или месяцу (granularity). ' +
      'from/to задают период, granularity — шаг разбивки (day|week|month). Если ничего не передать — берётся текущий месяц по дням. ' +
      'Используйте для построения столбчатых/линейных диаграмм динамики доходов.',
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
    summary: 'Получить доход по id',
    description:
      'Возвращает один доход по его id с вложенной category. Доступны только свои записи: ' +
      'чужой или несуществующий id → 404.',
  })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'С вложенной category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить доход',
    description:
      'Частично обновляет свой доход по id: можно менять сумму, валюту, категорию, дату или комментарий — ' +
      'присылайте только изменяемые поля. Новый categoryId должен принадлежать пользователю. Чужой id → 404.',
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
    summary: 'Массовое удаление доходов',
    description:
      'Удаляет сразу несколько своих доходов — в теле передаётся массив ids. Удаляются только записи, ' +
      'принадлежащие пользователю (чужие id просто игнорируются). В ответе — количество фактически удалённых записей. ' +
      'Для удаления одного дохода есть DELETE /incomes/:id.',
  })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Количество удалённых записей',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteIncomesDto) {
    return this.incomesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить доход',
    description:
      'Удаляет один свой доход по id. Чужой или несуществующий id → 404. ' +
      'В ответе — удалённая запись (без вложенной category).',
  })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'Удалённая запись, без category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.remove(id, user.id);
  }
}
