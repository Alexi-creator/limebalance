import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({ example: 'Bali vacation' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: '🌴' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiProperty({ example: 240000, description: 'Target amount in the goal currency (> 0)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount: number;

  @ApiProperty({ example: 'THB', description: 'Goal currency; contributions are in this currency' })
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Deadline date. Omit for a goal without a deadline.',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  targetDate?: Date;
}
