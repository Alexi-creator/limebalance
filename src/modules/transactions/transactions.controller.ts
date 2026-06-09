import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { PaginatedTransactionsDto } from './dto/transactions-response.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Лента транзакций (доходы + расходы) с пагинацией',
    description:
      'Единый постраничный список и доходов, и расходов пользователя в одной ленте, отсортированный по дате. ' +
      'Это основной эндпоинт для экрана истории операций. Фильтры (все опциональны): ' +
      'type (income|expense) — оставить только один вид; categoryId — по категории; ' +
      'search — поиск по комментарию; currency — по валюте; from/to — по диапазону дат. ' +
      'Пагинация: page (с 1) и limit (по умолчанию 20). В ответе — записи текущей страницы плюс мета (total и т.п.).',
  })
  @ApiOkResponse({ type: PaginatedTransactionsDto })
  findAll(@CurrentUser() user: { id: string }, @Query() dto: GetTransactionsDto) {
    return this.transactionsService.findAll(user.id, dto);
  }

  @Get('balance')
  @ApiOperation({
    summary: 'Общий баланс за всё время',
    description:
      'Считает суммарный баланс пользователя (все доходы минус все расходы) за всю историю. ' +
      'Поскольку операции могут быть в разных валютах, суммы приводятся к общей: возвращается значение в USD ' +
      'и в базовой валюте пользователя (из профиля). Удобно для виджета «текущий баланс» на дашборде.',
  })
  @ApiOkResponse({ type: BalanceResponseDto })
  balance(@CurrentUser() user: { id: string }) {
    return this.transactionsService.getBalance(user.id);
  }
}
