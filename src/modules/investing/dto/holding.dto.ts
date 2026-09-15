import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateHoldingDto {
  @ApiProperty({ example: 'BTC', description: 'Asset ticker' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,15}$/, { message: 'asset must be 1-15 alphanumeric chars' })
  asset: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description:
      'Venue this sits in. Manual venues only — a connected exchange reports its own coins, and ' +
      'tracking the same asset by hand would double it.',
  })
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @ApiPropertyOptional({
    example: 60000,
    description:
      'Average acquisition price per unit in USD; omit if unknown (then no PnL is shown)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgBuyPrice?: number;

  @ApiPropertyOptional({ example: 'Cold wallet', description: 'Where the asset is kept' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  location?: string;

  @ApiPropertyOptional({ example: 'Long-term stash' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateHoldingDto {
  @ApiPropertyOptional({ description: 'Move the asset to another venue' })
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @ApiPropertyOptional({ example: 'ETH' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,15}$/, { message: 'asset must be 1-15 alphanumeric chars' })
  asset?: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: 2800 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  avgBuyPrice?: number;

  @ApiPropertyOptional({ example: 'Ledger' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  location?: string;

  @ApiPropertyOptional({ example: 'Moved from exchange' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
