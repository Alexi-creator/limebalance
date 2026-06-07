import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategoryResponseDto } from '../../expense-categories/dto/expense-category-response.dto';

export class ExpenseResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID владельца' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({
    type: String,
    example: '1500.50',
    description: 'Сумма (Decimal, в JSON приходит строкой)',
  })
  amount: string;

  @ApiProperty({ example: 'THB', description: 'ISO 4217 код валюты записи' })
  currency: string;

  @ApiProperty({ example: 'Продукты в супермаркете' })
  description: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-01T00:30:00.000Z',
    description: 'Локальное время операции (стенные часы пользователя; Z — артефакт, не UTC)',
  })
  date: Date;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-06-01T08:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({
    type: ExpenseCategoryResponseDto,
    description: 'Категория (присутствует в GET-ответах; отсутствует в ответах POST/DELETE)',
  })
  category?: ExpenseCategoryResponseDto;
}

export class SummaryCurrencyTotalDto {
  @ApiProperty({ example: 'THB', description: 'Код валюты' })
  currency: string;

  @ApiProperty({
    example: 5000,
    description: 'Сумма в этой валюте за период (разные валюты не складываются)',
  })
  total: number;

  @ApiProperty({ example: 10, description: 'Количество операций в этой валюте' })
  count: number;
}

export class BucketSummaryDto {
  @ApiProperty({
    example: '2026-06-15',
    description: 'Ключ бакета: день/неделя — YYYY-MM-DD (неделя = её понедельник), месяц — YYYY-MM',
  })
  bucket: string;

  @ApiProperty({
    type: [SummaryCurrencyTotalDto],
    description: 'Разбивка за бакет по каждой валюте отдельно',
  })
  totals: SummaryCurrencyTotalDto[];

  @ApiProperty({
    example: 12345.5,
    nullable: true,
    description:
      'Прибл. сумма за бакет в базовой валюте по текущему курсу. null, если курсы недоступны.',
  })
  approxTotal: number | null;
}

export class ExpenseSummaryResponseDto {
  @ApiProperty({ example: 'RUB', description: 'Базовая валюта пользователя для total/approxTotal' })
  baseCurrency: string;

  @ApiProperty({
    enum: ['day', 'week', 'month'],
    example: 'month',
    description: 'Гранулярность бакетов',
  })
  granularity: 'day' | 'week' | 'month';

  @ApiProperty({
    example: 49102,
    nullable: true,
    description: 'Прибл. итог за весь период в базовой валюте. null, если курсы недоступны.',
  })
  total: number | null;

  @ApiProperty({ type: [BucketSummaryDto], description: 'Разбивка по бакетам (день/неделя/месяц)' })
  buckets: BucketSummaryDto[];
}
