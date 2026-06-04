import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class PlanResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440099' })
  id: string;

  @ApiProperty({ example: 'free' })
  name: string;

  @ApiProperty({
    example: 10,
    nullable: true,
    description: 'Лимит категорий или null (без лимита)',
  })
  maxCategories: number | null;

  @ApiProperty({ example: 100, nullable: true })
  maxExpenses: number | null;

  @ApiProperty({ example: 100, nullable: true })
  maxIncomes: number | null;

  @ApiProperty({ type: String, example: '0.00', description: 'Цена (Decimal, строкой)' })
  price: string;
}

export class SubscriptionResponseDto {
  @ApiProperty({ type: PlanResponseDto })
  plan: PlanResponseDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2027-01-01T00:00:00.000Z',
    description: 'Дата окончания подписки или null (бессрочно)',
  })
  expiresAt: Date | null;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'Ilia', nullable: true })
  name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '123456789',
    description: 'Telegram ID строкой (BigInt) или null',
  })
  telegramId: string | null;

  @ApiProperty({ example: 'THB', description: 'ISO 4217 код валюты по умолчанию' })
  currency: string;

  @ApiProperty({ example: 'Asia/Bangkok', description: 'IANA таймзона пользователя' })
  timezone: string;

  @ApiPropertyOptional({
    type: SubscriptionResponseDto,
    nullable: true,
    description: 'Подписка или null, если нет',
  })
  subscription: SubscriptionResponseDto | null;
}

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'Ilia', nullable: true })
  name: string | null;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({ example: 'THB' })
  currency: string;

  @ApiProperty({ example: 'Asia/Bangkok' })
  timezone: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-05-01T08:00:00.000Z' })
  createdAt: Date;
}
