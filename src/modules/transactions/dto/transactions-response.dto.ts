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

  @ApiProperty({ type: String, format: 'date-time', example: '2026-06-01T00:30:00.000Z' })
  date: Date;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: 'income' | 'expense';
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionRowDto] })
  items: TransactionRowDto[];

  @ApiProperty({ example: 137, description: 'Всего записей по фильтру' })
  total: number;

  @ApiProperty({ example: 1, description: 'Текущая страница' })
  page: number;

  @ApiProperty({ example: 20, description: 'Размер страницы' })
  limit: number;

  @ApiProperty({ example: 7, description: 'Всего страниц' })
  totalPages: number;
}
