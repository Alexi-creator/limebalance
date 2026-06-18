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

export class CreateIncomeDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'May salary' })
  @IsString()
  description: string;

  @ApiProperty({
    example: '2026-06-01T00:30:00',
    description: 'Operation local time, without a timezone',
  })
  @IsDate()
  @Type(() => Date)
  date: Date;

  @ApiPropertyOptional({
    example: 'THB',
    description: "ISO 4217 currency code, defaults to the user's currency",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;
}
