import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from './get-transactions.dto';

export class TransactionRowDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({ example: 'Продукты', nullable: true, description: 'Название категории или null' })
  categoryName: string | null;

  @ApiProperty({ example: 1500.5, description: 'Сумма (число, float)' })
  amount: number;

  @ApiProperty({ example: 'USD', description: 'Валюта' })
  currency: string;

  @ApiProperty({ example: 'Продукты в супермаркете' })
  description: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-06-01',
    description: 'Дата операции (без времени)',
  })
  date: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-01T08:00:00.000Z',
    description: 'Момент создания (UTC) — вторичная сортировка внутри дня',
  })
  createdAt: Date;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: 'income' | 'expense';
}

export class TransactionsSummaryDto {
  @ApiProperty({ example: 'THB', description: 'Базовая валюта пользователя для сумм ниже' })
  baseCurrency: string;

  @ApiProperty({
    example: 90480,
    nullable: true,
    description:
      'Прибл. сумма доходов по всей выборке (не только странице) в базовой валюте. null, если курсы недоступны.',
  })
  income: number | null;

  @ApiProperty({
    example: 49102,
    nullable: true,
    description:
      'Прибл. сумма расходов по всей выборке в базовой валюте. null, если курсы недоступны.',
  })
  expense: number | null;

  @ApiProperty({
    example: 41378,
    nullable: true,
    description: 'Чистый итог (доходы − расходы) в базовой валюте. null, если курсы недоступны.',
  })
  net: number | null;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionRowDto] })
  items: TransactionRowDto[];

  @ApiProperty({
    type: TransactionsSummaryDto,
    description: 'Денежный итог по всей выборке (с учётом фильтров), приведённый к базовой валюте',
  })
  summary: TransactionsSummaryDto;

  @ApiProperty({ example: 137, description: 'Всего записей по фильтру' })
  total: number;

  @ApiProperty({ example: 1, description: 'Текущая страница' })
  page: number;

  @ApiProperty({ example: 20, description: 'Размер страницы' })
  limit: number;

  @ApiProperty({ example: 7, description: 'Всего страниц' })
  totalPages: number;
}
