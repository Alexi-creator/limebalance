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

export class MonthTotalDto {
  @ApiProperty({ example: '2026-06', description: 'Месяц в формате YYYY-MM' })
  month: string;

  @ApiProperty({ example: '1234.50', description: 'Сумма за месяц, строкой с 2 знаками' })
  total: string;
}

export class ExpenseSummaryResponseDto {
  @ApiProperty({ example: '5678.90', description: 'Итог за период, строкой с 2 знаками' })
  total: string;

  @ApiProperty({ type: [MonthTotalDto], description: 'Помесячная разбивка' })
  byMonth: MonthTotalDto[];
}
