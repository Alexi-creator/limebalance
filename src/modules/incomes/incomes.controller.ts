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
  @ApiOperation({ summary: 'Создать доход' })
  @ApiCreatedResponse({ type: IncomeResponseDto, description: 'Без вложенной category' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateIncomeDto) {
    return this.incomesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить доходы пользователя' })
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
    summary: 'Итог доходов за период (бакеты по дню/неделе/месяцу)',
    description: 'Диапазон from/to + granularity (day|week|month). По умолчанию — текущий месяц.',
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
  @ApiOperation({ summary: 'Получить доход по id' })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'С вложенной category' })
  findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить доход' })
  @ApiOkResponse({ type: IncomeResponseDto })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateIncomeDto,
  ) {
    return this.incomesService.update(id, user.id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Массовое удаление доходов' })
  @ApiOkResponse({
    schema: { example: { deleted: 2 } },
    description: 'Количество удалённых записей',
  })
  removeMany(@CurrentUser() user: { id: string }, @Body() dto: BulkDeleteIncomesDto) {
    return this.incomesService.removeMany(user.id, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить доход' })
  @ApiOkResponse({ type: IncomeResponseDto, description: 'Удалённая запись, без category' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.incomesService.remove(id, user.id);
  }
}
