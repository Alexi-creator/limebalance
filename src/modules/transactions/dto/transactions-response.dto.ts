import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from './get-transactions.dto';

export class TransactionRowDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({ example: 'Groceries', nullable: true, description: 'Category name or null' })
  categoryName: string | null;

  @ApiProperty({ example: 1500.5, description: 'Amount (number, float)' })
  amount: number;

  @ApiProperty({ example: 'USD', description: 'Currency' })
  currency: string;

  @ApiProperty({ example: 'Groceries at the supermarket' })
  description: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-06-01',
    description: 'Operation date (without time)',
  })
  date: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-01T08:00:00.000Z',
    description: 'Creation moment (UTC) — secondary sort within a day',
  })
  createdAt: Date;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  type: 'income' | 'expense';
}

export class TransactionsSummaryDto {
  @ApiProperty({ example: 'THB', description: "User's base currency for the totals below" })
  baseCurrency: string;

  @ApiProperty({
    example: 90480,
    nullable: true,
    description:
      'Approx. income total over the current page (items) in the base currency. null if rates are unavailable.',
  })
  income: number | null;

  @ApiProperty({
    example: 49102,
    nullable: true,
    description:
      'Approx. expense total over the current page (items) in the base currency. null if rates are unavailable.',
  })
  expense: number | null;

  @ApiProperty({
    example: 41378,
    nullable: true,
    description:
      'Net total (income − expenses) in the base currency. null if rates are unavailable.',
  })
  net: number | null;
}

export class PaginatedTransactionsDto {
  @ApiProperty({ type: [TransactionRowDto] })
  items: TransactionRowDto[];

  @ApiProperty({
    type: TransactionsSummaryDto,
    description:
      'Monetary total over the current page (items), converted to the base currency',
  })
  summary: TransactionsSummaryDto;

  @ApiProperty({ example: 137, description: 'Total records matching the filter' })
  total: number;

  @ApiProperty({ example: 1, description: 'Current page' })
  page: number;

  @ApiProperty({ example: 20, description: 'Page size' })
  limit: number;

  @ApiProperty({ example: 7, description: 'Total pages' })
  totalPages: number;
}
