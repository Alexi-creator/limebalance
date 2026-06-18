import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BucketSummaryDto } from '../../expenses/dto/expense-response.dto';
import { IncomeCategoryResponseDto } from '../../income-categories/dto/income-category-response.dto';

export class IncomeResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440020' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Owner ID' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  categoryId: string;

  @ApiProperty({
    type: String,
    example: '50000.00',
    description: 'Amount (Decimal, comes as a string in JSON)',
  })
  amount: string;

  @ApiProperty({ example: 'THB', description: "Record's ISO 4217 currency code" })
  currency: string;

  @ApiProperty({ example: 'May salary' })
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
    type: IncomeCategoryResponseDto,
    description: 'Category (present in GET responses; absent in POST/DELETE responses)',
  })
  category?: IncomeCategoryResponseDto;
}

export class IncomeSummaryResponseDto {
  @ApiProperty({ example: 'RUB', description: "User's base currency for total/approxTotal" })
  baseCurrency: string;

  @ApiProperty({
    enum: ['day', 'week', 'month'],
    example: 'month',
    description: 'Bucket granularity',
  })
  granularity: 'day' | 'week' | 'month';

  @ApiProperty({
    example: 90480,
    nullable: true,
    description:
      'Approx. total for the whole period in the base currency. null if rates are unavailable.',
  })
  total: number | null;

  @ApiProperty({ type: [BucketSummaryDto], description: 'Breakdown by buckets (day/week/month)' })
  buckets: BucketSummaryDto[];
}
