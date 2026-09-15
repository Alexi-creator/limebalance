import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransferDirection, TransferPeer, VenueMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const CURRENCY = { message: 'must be a 3-letter ISO 4217 code' };

export class CreateTransferDto {
  @ApiProperty({ description: 'Venue this transfer is about' })
  @IsUUID()
  venueId: string;

  @ApiProperty({
    enum: TransferDirection,
    description: "From the venue's point of view: IN = it gained the money, OUT = it left.",
  })
  @IsEnum(TransferDirection)
  direction: TransferDirection;

  @ApiProperty({
    enum: TransferPeer,
    description:
      'Who is on the other side. LEDGER moves your free balance; VENUE moves money between two ' +
      'venues and touches no balance; EXTERNAL means it went to someone else and is gone for good.',
  })
  @IsEnum(TransferPeer)
  peer: TransferPeer;

  @ApiPropertyOptional({ description: 'Required when peer = VENUE' })
  @IsOptional()
  @IsUUID()
  peerVenueId?: string;

  @ApiPropertyOptional({
    example: 1000,
    description:
      'Always positive — the sign lives in `direction`. Required unless the move is in a coin, ' +
      'where the price decides the figure.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'The currency that actually left or reached your wallet. Only meaningful when peer is ' +
      'LEDGER — everything outside the ledger is denominated in USD.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, CURRENCY)
  currency?: string;

  @ApiPropertyOptional({
    example: 'BTC',
    description:
      'Ticker, when the move is made in a coin rather than money — sending BTC to a cold wallet. ' +
      'The composition of every manual venue involved shifts by `assetAmount`. Not allowed ' +
      'against the ledger, which holds money rather than coins.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,15}$/, { message: 'asset must be 1-15 alphanumeric chars' })
  asset?: string;

  @ApiPropertyOptional({ example: 0.01, description: 'How much of `asset` moved' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  assetAmount?: number;

  @ApiPropertyOptional({ example: '2026-09-14T00:00:00', description: 'Defaults to today' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ example: 'на торговлю' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateTransferDto {
  @ApiPropertyOptional({ enum: TransferDirection })
  @IsOptional()
  @IsEnum(TransferDirection)
  direction?: TransferDirection;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, CURRENCY)
  currency?: string;

  @ApiPropertyOptional({ example: '2026-09-14T00:00:00' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ example: 'на торговлю' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class TransferResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() venueId: string;
  @ApiProperty({ example: 'Bybit' }) venueName: string;
  @ApiProperty({ enum: TransferDirection }) direction: TransferDirection;
  @ApiProperty({ enum: TransferPeer }) peer: TransferPeer;
  @ApiProperty({ nullable: true }) peerVenueId: string | null;
  @ApiProperty({ example: 'Ledger', nullable: true }) peerVenueName: string | null;
  @ApiProperty({ example: 1000 }) amount: number;
  @ApiProperty({ example: 'USD' }) currency: string;

  @ApiProperty({ example: 'BTC', nullable: true, description: 'Set when the move was in a coin' })
  asset: string | null;

  @ApiProperty({ example: 0.01, nullable: true }) assetAmount: number | null;

  @ApiProperty({
    example: 1000,
    nullable: true,
    description:
      "The amount in USD at that day's rate. null when no rate was available — the transfer is " +
      'recorded but stays out of the USD figures until one is.',
  })
  amountUsd: number | null;

  @ApiProperty({ example: 'на торговлю', nullable: true }) note: string | null;
  @ApiProperty() date: Date;
}

export class TransferListResponseDto {
  @ApiProperty({ type: [TransferResponseDto] }) items: TransferResponseDto[];
  @ApiProperty({ example: 12 }) total: number;
}

export class VenueCoinDto {
  @ApiProperty({ example: 'BTC' }) coin: string;
  @ApiProperty({ example: 0.0184 }) amount: number;
  @ApiProperty({ example: 1240.5, nullable: true }) usdValue: number | null;
}

export class VenueDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Bybit' }) name: string;
  @ApiProperty({ nullable: true, description: 'Connected exchange behind it, if any' })
  accountId: string | null;

  @ApiProperty({
    enum: VenueMode,
    description:
      'LIVE means the value is read from the exchange every sync; MANUAL means it is whatever ' +
      'you tell us it is.',
  })
  mode: VenueMode;

  @ApiProperty({ example: false }) archived: boolean;

  @ApiProperty({ example: 1000, description: 'Net moved in since tracking started, in USD' })
  transferredUsd: number;

  @ApiProperty({
    example: 638.27,
    nullable: true,
    description: 'What it is worth now. null when the exchange could not be read at all yet.',
  })
  valueUsd: number | null;

  @ApiProperty({
    example: -361.73,
    nullable: true,
    description: 'value − (opening + transferred): the result since tracking began.',
  })
  resultUsd: number | null;

  @ApiProperty({
    example: 638.27,
    nullable: true,
    description: 'What was already here when tracking started — never counted as a result.',
  })
  openingUsd: number | null;

  @ApiProperty({
    example: -200,
    description: 'Net of the manual corrections applied to this venue, USD.',
  })
  adjustmentsUsd: number;

  @ApiProperty({
    nullable: true,
    description: 'When the value was last read. Show its age rather than a stale figure alone.',
  })
  valueAt: Date | null;

  @ApiProperty({ type: [VenueCoinDto], description: 'What the exchange reports holding' })
  coins: VenueCoinDto[];
}

export class VenuesResponseDto {
  @ApiProperty({ type: [VenueDto] }) items: VenueDto[];
  @ApiProperty({ example: 'USD' }) baseCurrency: string;
  @ApiProperty({ example: 1638.27, description: 'Everything the venues are worth, USD' })
  totalUsd: number;

  @ApiProperty({ example: 58000, nullable: true, description: 'The same total in your currency' })
  totalBase: number | null;

  @ApiProperty({ example: 1300, description: 'Opening balances + everything moved in, USD' })
  investedUsd: number;

  @ApiProperty({ example: 338.27, description: 'total − invested' })
  resultUsd: number;

  @ApiProperty({
    example: false,
    description: 'At least one venue could not be valued, so the totals are a lower bound.',
  })
  isPartial: boolean;
}

export class CreateVenueDto {
  @ApiProperty({
    example: 'Ledger',
    description:
      'A place you keep by hand — a cold wallet, an exchange with no API key. Connected exchanges ' +
      'get their venue automatically and are not created here.',
  })
  @IsString()
  @MaxLength(60)
  name: string;
}

export class UpdateVenueDto {
  @ApiPropertyOptional({ example: 'Ledger Nano' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Hides the venue. Its money keeps counting — archiving is not a withdrawal.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreateAdjustmentDto {
  @ApiProperty({
    example: -200,
    description:
      'Signed, in USD: negative when the venue holds less than we think, positive when more. ' +
      'Never zero.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  amountUsd: number;

  @ApiProperty({
    example: 'перевёл подрядчику',
    description: 'Required — a correction without a reason is indistinguishable from a mistake.',
  })
  @IsString()
  @MaxLength(200)
  note: string;

  @ApiPropertyOptional({ example: '2026-09-14T00:00:00', description: 'Defaults to today' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;
}

export class AdjustmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() venueId: string;
  @ApiProperty({ example: -200 }) amountUsd: number;
  @ApiProperty({ example: 'перевёл подрядчику' }) note: string;
  @ApiProperty() date: Date;
}
