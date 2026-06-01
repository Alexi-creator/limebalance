import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateIncomeDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Зарплата за май' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:30:00' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;
}
