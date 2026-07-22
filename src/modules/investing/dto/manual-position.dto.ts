import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateManualPositionDto {
  @ApiProperty({ example: 'BTCUSDT', description: 'Trading pair / instrument name' })
  @IsString()
  @Matches(/^[A-Za-z0-9/_-]{2,20}$/, { message: 'symbol must be 2-20 chars (letters/digits)' })
  symbol: string;

  @ApiProperty({ enum: ['long', 'short'], example: 'long' })
  @IsIn(['long', 'short'])
  direction: 'long' | 'short';

  @ApiProperty({ example: 0.5, description: 'Position size in the base asset' })
  @IsNumber()
  @IsPositive()
  qty: number;

  @ApiProperty({ example: 64000.5, description: 'Average entry price' })
  @IsNumber()
  @IsPositive()
  entryPrice: number;

  @ApiPropertyOptional({
    example: 65200,
    description:
      'Average exit price. Omit to log the trade as still open — add it later to close it.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exitPrice?: number;

  @ApiPropertyOptional({
    example: 580.5,
    description:
      'Realized PnL in USD(T). Omit to compute from the prices and size; set explicitly to account for fees',
  })
  @IsOptional()
  @IsNumber()
  closedPnl?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  leverage?: number;

  @ApiPropertyOptional({
    example: '2026-07-10T09:00:00Z',
    description: 'When the position was opened',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  openedAt?: Date;

  @ApiPropertyOptional({
    example: '2026-07-12T15:30:00Z',
    description: 'When the position was closed. Omit to log the trade as still open.',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  closedAt?: Date;

  @ApiPropertyOptional({ example: 'MEXC', description: 'Where the trade happened (free-form)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  venue?: string;

  @ApiPropertyOptional({
    example: 'Entered on the breakout above 65k, tight stop below the range.',
    description: 'Optional journal note created together with the trade (e.g. the entry reason)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @ApiPropertyOptional({ example: 'https://i.imgur.com/chart123.png' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  noteImageUrl?: string;
}

export class UpdateManualPositionDto {
  @ApiPropertyOptional({ example: 'ETHUSDT' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9/_-]{2,20}$/, { message: 'symbol must be 2-20 chars (letters/digits)' })
  symbol?: string;

  @ApiPropertyOptional({ enum: ['long', 'short'] })
  @IsOptional()
  @IsIn(['long', 'short'])
  direction?: 'long' | 'short';

  @ApiPropertyOptional({ example: 1.2 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;

  @ApiPropertyOptional({ example: 3400 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  entryPrice?: number;

  @ApiPropertyOptional({ example: 3550 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exitPrice?: number;

  @ApiPropertyOptional({
    example: 175.4,
    description: 'Explicit PnL; omit to recompute when prices/size/direction change',
  })
  @IsOptional()
  @IsNumber()
  closedPnl?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  leverage?: number;

  @ApiPropertyOptional({ example: '2026-07-10T09:00:00Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  openedAt?: Date;

  @ApiPropertyOptional({ example: '2026-07-12T15:30:00Z' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  closedAt?: Date;
}
