import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateContributionDto {
  @ApiProperty({
    example: 19200,
    description: 'Amount in the goal currency. Negative = withdrawal / correction.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @ApiPropertyOptional({ example: 'Payday stash' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    example: '2026-06-20',
    description: 'Contribution date. Defaults to today.',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;
}
