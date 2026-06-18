import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExpenseCategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Owner ID' })
  userId: string;

  @ApiProperty({ example: 'Groceries' })
  name: string;

  @ApiProperty({ example: '🛒', nullable: true, description: 'Category emoji or null' })
  emoji: string | null;

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z', format: 'date-time' })
  createdAt: Date;
}

export class CategoryCurrencyTotalDto {
  @ApiProperty({ example: 'THB', description: 'Currency code' })
  currency: string;

  @ApiProperty({ example: 5000, description: 'Total expenses in this currency for the period' })
  total: number;

  @ApiProperty({ example: 10, description: 'Number of operations in this currency for the period' })
  count: number;
}

export class ExpenseCategoryStatDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'Groceries' })
  name: string;

  @ApiProperty({ example: '🛒', nullable: true })
  emoji: string | null;

  @ApiProperty({
    example: 7,
    description: 'Total operations for the category over the period (across all currencies)',
  })
  count: number;

  @ApiProperty({
    type: [CategoryCurrencyTotalDto],
    description: 'Totals per currency separately (different currencies are not summed)',
  })
  totals: CategoryCurrencyTotalDto[];

  @ApiProperty({ example: 'USD', description: "User's base currency for approxTotal" })
  baseCurrency: string;

  @ApiProperty({
    example: 260.5,
    nullable: true,
    description:
      'Approximate amount in the base currency at the current rate. null if rates are unavailable.',
  })
  approxTotal: number | null;

  @ApiPropertyOptional({
    example: 210.0,
    nullable: true,
    description:
      'Total for the previous period in the base currency. Present only with compareFrom/compareTo.',
  })
  previousApproxTotal?: number | null;

  @ApiPropertyOptional({
    example: 50.5,
    nullable: true,
    description:
      'Difference from the previous period (approxTotal − previousApproxTotal). Present only when comparing.',
  })
  deltaApproxTotal?: number | null;
}
