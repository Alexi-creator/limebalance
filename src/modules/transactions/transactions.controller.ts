import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Получить транзакции с пагинацией и фильтрами' })
  findAll(@CurrentUser() user: { id: string }, @Query() dto: GetTransactionsDto) {
    return this.transactionsService.findAll(user.id, dto);
  }
}
