import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonthSummaryDto } from '../../expenses/dto/expense-response.dto';
import { IncomeCategoryResponseDto } from '../../income-categories/dto/income-category-response.dto';

export class IncomeResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440020' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID владельца' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({
    type: String,
    example: '50000.00',
    description: 'Сумма (Decimal, в JSON приходит строкой)',
  })
  amount: string;

  @ApiProperty({ example: 'THB', description: 'ISO 4217 код валюты записи' })
  currency: string;

  @ApiProperty({ example: 'Зарплата за май' })
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
    type: IncomeCategoryResponseDto,
    description: 'Категория (присутствует в GET-ответах; отсутствует в ответах POST/DELETE)',
  })
  category?: IncomeCategoryResponseDto;
}

export class IncomeSummaryResponseDto {
  @ApiProperty({ example: 'RUB', description: 'Базовая валюта пользователя для total/approxTotal' })
  baseCurrency: string;

  @ApiProperty({
    example: 90480,
    nullable: true,
    description: 'Прибл. итог за весь период в базовой валюте. null, если курсы недоступны.',
  })
  total: number | null;

  @ApiProperty({ type: [MonthSummaryDto], description: 'Помесячная разбивка' })
  byMonth: MonthSummaryDto[];
}
