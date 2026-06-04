import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 1500.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Groceries at supermarket' })
  @IsString()
  description: string;

  @ApiProperty({
    example: '2026-06-01T00:30:00',
    description: 'Локальное время операции, без таймзоны',
  })
  @IsDate()
  @Type(() => Date)
  date: Date;

  @ApiPropertyOptional({
    example: 'THB',
    description: 'ISO 4217 код валюты, по умолчанию валюта пользователя',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;
}
