import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBetDto {
  @ApiProperty({ example: 'Arsenal — Chelsea' })
  @IsString()
  @MaxLength(200)
  event: string;

  @ApiPropertyOptional({ example: '1X2, Arsenal', description: 'Market / selection' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  market?: string;

  @ApiProperty({ example: 50, description: 'Stake, in the account currency' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  stake: number;

  @ApiProperty({ example: 2.35, description: 'Decimal odds' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  odds: number;

  @ApiPropertyOptional({ example: '2026-09-13T18:30:00', description: 'Defaults to now' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  placedAt?: Date;

  @ApiPropertyOptional({
    enum: BetStatus,
    default: BetStatus.PENDING,
    description: 'Pass a settled status to record a bet that is already decided (backfill)',
  })
  @IsOptional()
  @IsEnum(BetStatus)
  status?: BetStatus;

  @ApiPropertyOptional({
    example: 117.5,
    description:
      'Total returned, stake included. Optional — defaults from the status: stake × odds for WON, ' +
      '0 for LOST, the stake itself for VOID. Required for CASHOUT, which has no derivable payout.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payout?: number;

  @ApiPropertyOptional({ example: 'форма хозяев, травма у соперника' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateBetDto {
  @ApiPropertyOptional({ example: 'Arsenal — Chelsea' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  event?: string;

  @ApiPropertyOptional({ example: '1X2, Arsenal' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  market?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  stake?: number;

  @ApiPropertyOptional({ example: 2.35 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  odds?: number;

  @ApiPropertyOptional({
    enum: BetStatus,
    description:
      'Settling the bet. Moving it back to PENDING clears payout and settledAt, so a mistaken ' +
      'settlement can be undone.',
  })
  @IsOptional()
  @IsEnum(BetStatus)
  status?: BetStatus;

  @ApiPropertyOptional({ example: 117.5, description: 'Total returned, stake included' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payout?: number;

  @ApiPropertyOptional({ example: '2026-09-13T20:15:00', description: 'Defaults to now on settle' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  settledAt?: Date;

  @ApiPropertyOptional({ example: 'форма хозяев' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class BetDto {
  @ApiProperty() id: string;
  @ApiProperty() accountId: string;
  @ApiProperty({ example: 'Arsenal — Chelsea' }) event: string;
  @ApiProperty({ example: '1X2, Arsenal' }) market: string;
  @ApiProperty({ example: 50 }) stake: number;
  @ApiProperty({ example: 2.35 }) odds: number;
  @ApiProperty({ enum: BetStatus }) status: BetStatus;
  @ApiProperty({ example: 'USD' }) currency: string;

  @ApiProperty({ example: 117.5, nullable: true, description: 'Total returned, stake included' })
  payout: number | null;

  @ApiProperty({
    example: 67.5,
    nullable: true,
    description: 'payout − stake. null while PENDING — an undecided bet has no result yet.',
  })
  pnl: number | null;

  @ApiProperty({ example: 'форма хозяев', nullable: true }) note: string | null;
  @ApiProperty() placedAt: Date;
  @ApiProperty({ nullable: true }) settledAt: Date | null;
}

export class BetsSummaryDto {
  @ApiProperty({ example: 14, description: 'Bets matching the filter' }) count: number;
  @ApiProperty({ example: 12 }) settledCount: number;
  @ApiProperty({ example: 2 }) pendingCount: number;
  @ApiProperty({ example: 7 }) wonCount: number;
  @ApiProperty({ example: 4 }) lostCount: number;

  @ApiProperty({ example: 1, description: 'Cancelled / pushed — the stake came back, PnL zero' })
  voidCount: number;

  @ApiProperty({ example: 0, description: 'Sold back before settlement' }) cashoutCount: number;

  @ApiProperty({
    example: 600,
    description:
      'Total staked across settled bets, VOID excluded (a returned stake was never really at ' +
      'risk) — the turnover ROI is measured against.',
  })
  turnover: number;

  @ApiProperty({ example: 150, description: 'Realized PnL of settled bets' }) pnl: number;

  @ApiProperty({
    example: 63.64,
    nullable: true,
    description:
      'won / (won + lost), in percent. VOID and CASHOUT are excluded — neither is a clean ' +
      'win or loss. null when nothing has been decided.',
  })
  winRate: number | null;

  @ApiProperty({
    example: 25,
    nullable: true,
    description: 'pnl / turnover, in percent — the real edge. null with no turnover.',
  })
  roi: number | null;

  @ApiProperty({
    example: 2.14,
    nullable: true,
    description: 'Plain average of the odds across the matching bets. null when there are none.',
  })
  avgOdds: number | null;
}

export class BetsResponseDto {
  @ApiProperty({ type: [BetDto] }) items: BetDto[];
  @ApiProperty({ example: 14, description: 'Total matching the filter, before paging' })
  total: number;
  @ApiProperty({ type: BetsSummaryDto }) summary: BetsSummaryDto;
}
