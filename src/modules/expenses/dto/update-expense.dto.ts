import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxDate,
} from 'class-validator';

export class UpdateExpenseDto {
  @ApiPropertyOptional({ example: 2000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Обновлённое описание' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: '2026-05-27T10:00:00.000Z' })
  @IsOptional()
  @IsDate()
  @MaxDate(() => new Date())
  @Type(() => Date)
  date?: Date;
}
