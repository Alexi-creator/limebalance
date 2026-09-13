import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalAccountKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const CURRENCY = { message: 'must be a 3-letter ISO 4217 code' };

export class CreateBettingAccountDto {
  @ApiProperty({ example: 'Pinnacle' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: '🎯' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @ApiProperty({
    example: 'USD',
    description: 'The account is single-currency: transfers and bets are always in this currency',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/, CURRENCY)
  currency: string;

  @ApiPropertyOptional({
    enum: ExternalAccountKind,
    default: ExternalAccountKind.BETTING,
    description: 'What holds the money. Only BETTING has a bets table behind it today.',
  })
  @IsOptional()
  @IsEnum(ExternalAccountKind)
  kind?: ExternalAccountKind;
}

export class UpdateBettingAccountDto {
  @ApiPropertyOptional({ example: 'Pinnacle' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: '🎯' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Hides the account. Its money keeps counting against the free balance — archiving is not ' +
      'a withdrawal.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class BettingAccountDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Pinnacle' }) name: string;
  @ApiProperty({ example: '🎯', nullable: true }) emoji: string | null;
  @ApiProperty({ enum: ExternalAccountKind }) kind: ExternalAccountKind;
  @ApiProperty({ example: 'USD' }) currency: string;
  @ApiProperty({ example: false }) archived: boolean;

  @ApiProperty({
    example: 1000,
    description:
      'Net moved in from the ledger: deposits minus withdrawals. This is the only figure the ' +
      'balance subtracts — negative means more has been taken out than was ever put in.',
  })
  transferred: number;

  @ApiProperty({
    example: 1150,
    description: 'What the account is worth now: transferred + realized PnL of settled bets.',
  })
  value: number;

  @ApiProperty({
    example: 150,
    description: 'Realized PnL of every settled bet — the money the bets themselves made.',
  })
  pnl: number;

  @ApiProperty({
    example: 50,
    description: 'Stake locked in bets that have not been settled yet.',
  })
  pendingStake: number;

  @ApiProperty({
    example: 1100,
    description: 'value − pendingStake: what could be withdrawn or staked right now.',
  })
  available: number;

  @ApiProperty({ example: 12, description: 'Settled bets' }) settledCount: number;
  @ApiProperty({ example: 2, description: 'Bets still open' }) pendingCount: number;
  @ApiProperty() createdAt: Date;
}

export class BettingSummaryDto {
  @ApiProperty({ example: 'USD', description: "The user's base currency" })
  baseCurrency: string;

  @ApiProperty({
    example: 1150,
    nullable: true,
    description: 'Value of every account rolled into the base currency. null if rates are missing.',
  })
  value: number | null;

  @ApiProperty({ example: 1000, nullable: true, description: 'Net transferred in, in base' })
  transferred: number | null;

  @ApiProperty({ example: 150, nullable: true, description: 'Realized PnL, in base' })
  pnl: number | null;

  @ApiProperty({
    example: true,
    description: 'A conversion was involved, so the roll-up is an estimate — show it with a "≈"',
  })
  isApproximate: boolean;
}

export class BettingAccountsResponseDto {
  @ApiProperty({ type: [BettingAccountDto] }) items: BettingAccountDto[];
  @ApiProperty({ type: BettingSummaryDto }) summary: BettingSummaryDto;
}
