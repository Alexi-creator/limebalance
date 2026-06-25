import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AdminUserCountsDto {
  @ApiProperty({ example: 4, description: 'Expense categories the user has created' })
  expenseCategories: number;

  @ApiProperty({ example: 2, description: 'Income categories the user has created' })
  incomeCategories: number;

  @ApiProperty({ example: 6, description: 'Total categories (expense + income)' })
  categories: number;

  @ApiProperty({ example: 130, description: 'Expense records (lifetime)' })
  expenses: number;

  @ApiProperty({ example: 18, description: 'Income records (lifetime)' })
  incomes: number;

  @ApiProperty({ example: 148, description: 'Total transactions (expenses + incomes)' })
  transactions: number;

  @ApiProperty({ example: 3, description: 'Goals the user has created' })
  goals: number;
}

export class AdminUserDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'Ilia' })
  name: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({ example: 'THB', description: 'Default ISO 4217 currency code' })
  currency: string;

  @ApiProperty({ example: 'Asia/Bangkok', description: "User's IANA timezone" })
  timezone: string;

  @ApiProperty({ example: true, description: 'Whether the account email is confirmed' })
  emailVerified: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'When the account was blocked, or null if active',
  })
  blockedAt: Date | null;

  @ApiProperty({ example: false, description: 'Convenience flag: blockedAt !== null' })
  isBlocked: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-05-01T08:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: false, description: 'Whether a Telegram account is linked' })
  hasTelegram: boolean;

  @ApiProperty({ example: true, description: 'Whether a Google account is linked' })
  hasGoogle: boolean;

  @ApiProperty({ example: true, description: 'Whether a password is set' })
  hasPassword: boolean;

  @ApiProperty({
    example: 'pro',
    nullable: true,
    description: 'Current plan name (free / pro / ultra), or null if no subscription',
  })
  plan: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2027-01-01T00:00:00.000Z',
    description: 'Subscription end date, or null (perpetual / no subscription)',
  })
  planExpiresAt: Date | null;

  @ApiProperty({ type: AdminUserCountsDto })
  counts: AdminUserCountsDto;
}
