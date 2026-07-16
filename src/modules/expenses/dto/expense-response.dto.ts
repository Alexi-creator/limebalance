import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategoryResponseDto } from '../../expense-categories/dto/expense-category-response.dto';

export class ExpenseResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Owner ID' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({
    type: String,
    example: '1500.50',
    description: 'Amount (Decimal, comes as a string in JSON)',
  })
  amount: string;

  @ApiProperty({ example: 'THB', description: "Record's ISO 4217 currency code" })
  currency: string;

  @ApiProperty({ example: 'Groceries at the supermarket' })
  description: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-01T00:30:00.000Z',
    description: "Operation local time (the user's wall clock; Z is an artifact, not UTC)",
  })
  date: Date;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-06-01T08:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({
    type: ExpenseCategoryResponseDto,
    description: 'Category (present in GET responses; absent in POST/DELETE responses)',
  })
  category?: ExpenseCategoryResponseDto;
}

export class SummaryCurrencyTotalDto {
  @ApiProperty({ example: 'THB', description: 'Currency code' })
  currency: string;

  @ApiProperty({
    example: 5000,
    description: 'Amount in this currency for the period (different currencies are not summed)',
  })
  total: number;

  @ApiProperty({ example: 10, description: 'Number of operations in this currency' })
  count: number;
}

export class BucketSummaryDto {
  @ApiProperty({
    example: '2026-06-15',
    description: 'Bucket key: day/week — YYYY-MM-DD (week = its Monday), month — YYYY-MM',
  })
  bucket: string;

  @ApiProperty({
    type: [SummaryCurrencyTotalDto],
    description: 'Per-currency breakdown for the bucket',
  })
  totals: SummaryCurrencyTotalDto[];

  @ApiProperty({
    example: 12345.5,
    nullable: true,
    description:
      'Approx. amount for the bucket in the base currency at the current rate. null if rates are unavailable.',
  })
  approxTotal: number | null;
}

export class ExpenseStatItemDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-06-15T00:00:00.000Z',
    description: 'Operation date (civil date, without time)',
  })
  date: Date;

  @ApiProperty({ example: 1500.5, description: "Amount in the operation's original currency" })
  amount: number;

  @ApiProperty({ example: 'THB', description: "Operation's ISO 4217 currency code" })
  currency: string;

  @ApiPropertyOptional({ example: 'Groceries at the supermarket' })
  description?: string;
}

export class ExpenseStatCategoryDto {
  @ApiProperty({ example: 'Food', description: 'Category name' })
  category: string;

  @ApiProperty({ example: '🍔', nullable: true, description: 'Category emoji' })
  emoji: string | null;

  @ApiProperty({
    example: 12345.5,
    nullable: true,
    description:
      'Category total in the base currency at the current rate. null if rates are unavailable.',
  })
  total: number | null;

  @ApiProperty({
    type: [ExpenseStatItemDto],
    description: 'Category operations, each in its original currency',
  })
  items: ExpenseStatItemDto[];
}

export class ExpenseStatResponseDto {
  @ApiProperty({ example: 'RUB', description: "User's base currency for the totals" })
  baseCurrency: string;

  @ApiProperty({
    example: 49102,
    nullable: true,
    description:
      'Overall total for the period in the base currency. null if rates are unavailable.',
  })
  total: number | null;

  @ApiProperty({
    type: [ExpenseStatCategoryDto],
    description: 'Breakdown by categories with operation details',
  })
  categories: ExpenseStatCategoryDto[];
}

export class ExpenseSummaryResponseDto {
  @ApiProperty({ example: 'RUB', description: "User's base currency for total/approxTotal" })
  baseCurrency: string;

  @ApiProperty({
    enum: ['day', 'week', 'month'],
    example: 'month',
    description: 'Bucket granularity',
  })
  granularity: 'day' | 'week' | 'month';

  @ApiProperty({
    example: 49102,
    nullable: true,
    description:
      'Approx. total for the whole period in the base currency. null if rates are unavailable.',
  })
  total: number | null;

  @ApiProperty({ type: [BucketSummaryDto], description: 'Breakdown by buckets (day/week/month)' })
  buckets: BucketSummaryDto[];
}
