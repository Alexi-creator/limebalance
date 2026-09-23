import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransferDirection, TransferPeer, TransferSource, VenueMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
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
      'venues and touches no balance; EXTERNAL is the outside world — out to someone else and ' +
      'gone for good, or in from someone else or from what was here before tracking began.',
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

  @ApiPropertyOptional({
    example: '1893412345678901234',
    description:
      'The Bybit P2P order this transfer records (from GET /investing/accounts/:id/p2p-orders). ' +
      'The order then shows as recorded, and cannot be recorded a second time.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z-]{1,64}$/, { message: 'p2pOrderId must be an order id' })
  p2pOrderId?: string;
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

export class ClassifyTransferDto {
  @ApiProperty({
    enum: TransferPeer,
    description:
      'Who was really on the other side. LEDGER: your own money from (or back to) the balance. ' +
      'VENUE: another of your venues. EXTERNAL: someone else.',
  })
  @IsEnum(TransferPeer)
  peer: TransferPeer;

  @ApiPropertyOptional({ description: 'Required when peer = VENUE' })
  @IsOptional()
  @IsUUID()
  peerVenueId?: string;

  @ApiPropertyOptional({
    example: 50000,
    description: 'peer = LEDGER only, required there: what left or reached your wallet.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ example: 'RUB', description: 'peer = LEDGER only, required there' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, CURRENCY)
  currency?: string;

  @ApiPropertyOptional({ example: 'от брата' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({
    enum: ['INCOME', 'EXPENSE'],
    description:
      'Money earned straight onto the venue (INCOME, arrivals only) or spent straight from it ' +
      '(EXPENSE, departures only). Records a real income or expense in categoryId for amount in ' +
      'currency, plus the transfer carrying it on to the venue — the wallet nets to zero and the ' +
      'reports show it. peer is ignored then.',
  })
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE'])
  as?: 'INCOME' | 'EXPENSE';

  @ApiPropertyOptional({ description: 'Income or expense category; required with `as`' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'A transfer you already recorded by hand for this same movement: it is removed and its ' +
      'answer taken over. peer and the rest of this body are then ignored, except the note.',
  })
  @IsOptional()
  @IsUUID()
  replacesId?: string;
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

  @ApiProperty({
    enum: TransferSource,
    description: 'MANUAL: typed in by you. BYBIT: imported from the exchange history.',
  })
  source: TransferSource;

  @ApiProperty({
    description: 'Imported and not yet classified — counts as EXTERNAL until it is.',
  })
  needsReview: boolean;

  @ApiProperty({
    example: 'friend@mail.com',
    nullable: true,
    description: 'Imported only: the sender or recipient as the exchange names them.',
  })
  counterparty: string | null;

  @ApiProperty({ nullable: true, description: 'Imported only: the transaction hash, if any' })
  txId: string | null;

  @ApiProperty({
    enum: ['INCOME', 'EXPENSE'],
    nullable: true,
    description: 'Answered as money earned or spent straight on the venue',
  })
  linkedAs: 'INCOME' | 'EXPENSE' | null;

  @ApiProperty({
    nullable: true,
    description: 'The category of that income or expense: { name, emoji }',
  })
  linkedCategory: { name: string; emoji: string | null } | null;
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
    nullable: true,
    description:
      'When that baseline was taken — the date the result is measured from. Without it a small ' +
      'result reads as a lifetime figure instead of the few days it actually covers.',
  })
  openingAt: Date | null;

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

  @ApiProperty({
    example: 120,
    nullable: true,
    description:
      'LIVE only: the part of valueUsd sitting in the FUND account, where deposits land. null ' +
      'when the key cannot read it.',
  })
  fundUsd: number | null;

  @ApiProperty({ example: 1, description: 'Imported movements waiting to be classified' })
  pendingReview: number;
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

  @ApiProperty({
    example: 1000,
    description:
      'The opening half of investedUsd: what was already on the venues when tracking began, and ' +
      'was never put there through this app.',
  })
  openingUsd: number;

  @ApiProperty({ example: 338.27, description: 'total − invested' })
  resultUsd: number;

  @ApiProperty({
    example: false,
    description: 'At least one venue could not be valued, so the totals are a lower bound.',
  })
  isPartial: boolean;

  @ApiProperty({
    example: 1,
    description: 'Imported movements waiting to be classified, all venues',
  })
  pendingReview: number;
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

export class P2pOrderDto {
  @ApiProperty({ example: '1893412345678901234', description: "Bybit's order id" }) id: string;

  @ApiProperty({
    nullable: true,
    description: 'The account it came through; null once disconnected',
  })
  accountId: string | null;

  @ApiProperty({
    nullable: true,
    description: "That account's venue — where recording the order sends the transfer",
  })
  venueId: string | null;

  @ApiProperty({ enum: ['BUY', 'SELL'], description: 'BUY: you paid fiat and got the coin' })
  side: 'BUY' | 'SELL';

  @ApiProperty({ example: 'USDT' }) asset: string;
  @ApiProperty({ example: 540.5 }) quantity: number;
  @ApiProperty({ example: 50000 }) fiatAmount: number;
  @ApiProperty({ example: 'RUB' }) fiatCurrency: string;
  @ApiProperty({ example: 92.5 }) price: number;
  @ApiProperty({ example: 0, nullable: true }) fee: number | null;
  @ApiProperty({ example: 'CryptoSeller', nullable: true }) counterparty: string | null;

  @ApiProperty({
    enum: ['DONE', 'CANCELLED', 'DISPUTE', 'ACTIVE'],
    description: 'Only DONE orders moved money and can be recorded',
  })
  status: 'DONE' | 'CANCELLED' | 'DISPUTE' | 'ACTIVE';

  @ApiProperty() createdAt: Date;

  @ApiProperty({ nullable: true, description: 'The transfer this order was recorded as, if any' })
  transferId: string | null;

  @ApiProperty({ description: 'Recorded automatically (P2P auto-recording) rather than by hand' })
  autoRecorded: boolean;
}

export class P2pOrdersResponseDto {
  @ApiProperty({ type: [P2pOrderDto] }) items: P2pOrderDto[];
  @ApiProperty({ example: 42 }) total: number;

  @ApiProperty({ nullable: true, description: 'When the saved copy was last refreshed from Bybit' })
  syncedAt: Date | null;

  @ApiProperty({
    nullable: true,
    description:
      'Set when the latest refresh failed: { code: P2P_UNAVAILABLE, retCode, message }. The ' +
      'saved orders are still returned.',
  })
  syncError: { code: string; retCode: number; message: string } | null;
}
