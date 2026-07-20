import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeAccountResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440030' })
  id: string;

  @ApiProperty({ example: 'bybit' })
  exchange: string;

  @ApiProperty({ example: 'Main account' })
  label: string;

  @ApiProperty({ enum: ['ACTIVE', 'ERROR', 'DISABLED'], example: 'ACTIVE' })
  status: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Why the last sync failed; null when everything is fine',
  })
  lastError: string | null;

  @ApiProperty({
    example: '••••3f9a',
    nullable: true,
    description: 'Last 4 chars of the API key for recognition; the full key is never returned',
  })
  apiKeyMasked: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Trades are synced starting from this date (as far back as Bybit retains history)',
  })
  syncFrom: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSyncAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({
    example: true,
    description:
      'Present in the POST response; always true — keys with trade permissions are rejected',
  })
  readOnly?: boolean;
}

export class ClosedPositionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440040' })
  id: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440030',
    nullable: true,
    description: 'null for manual entries',
  })
  accountId: string | null;

  @ApiProperty({ enum: ['bybit', 'manual'], example: 'bybit' })
  source: string;

  @ApiProperty({ example: 'BTCUSDT' })
  symbol: string;

  @ApiProperty({
    example: 'linear',
    description:
      'linear — derivatives (PnL from Bybit), spot — derived from fills by FIFO, manual — hand-entered',
  })
  category: string;

  @ApiProperty({ example: 'Sell', description: 'Side of the closing order: Sell = long closed' })
  side: string;

  @ApiProperty({ type: String, example: '0.5', description: 'Decimal as string' })
  qty: string;

  @ApiProperty({ type: String, example: '64000.5' })
  avgEntryPrice: string;

  @ApiProperty({ type: String, example: '65200' })
  avgExitPrice: string;

  @ApiProperty({ type: String, example: '599.75', description: 'Realized PnL in USDT' })
  closedPnl: string;

  @ApiProperty({ type: String, example: '10', nullable: true })
  leverage: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Open time. For spot/manual, exact; for linear, derived from fills via FIFO — null when ' +
      'the opening fills predate the synced history.',
  })
  openedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  closedAt: Date;

  @ApiProperty({
    example: 580,
    description:
      'Capital actually committed, in USDT — (qty × avgEntryPrice) / leverage; 1x for spot/manual.',
  })
  entryVolumeUsd: number;

  @ApiProperty({
    example: -0.42,
    nullable: true,
    description:
      'Every fee (trading + funding) over the position’s life, signed as Bybit reports it ' +
      '(positive = paid, negative = rebate). Trading fees are already netted into closedPnl for ' +
      'bybit positions — this is for transparency, not to subtract again. Null for manual ' +
      'entries and undated linear positions.',
  })
  totalFeeUsd: number | null;
}

export class ClosedPositionListResponseDto {
  @ApiProperty({ type: [ClosedPositionResponseDto] })
  items: ClosedPositionResponseDto[];

  @ApiProperty({ example: 128, description: 'Total records matching the filter (for pagination)' })
  total: number;
}

export class TradeExecutionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440050' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440030' })
  accountId: string;

  @ApiProperty({ example: 'BTCUSDT' })
  symbol: string;

  @ApiProperty({ example: 'linear' })
  category: string;

  @ApiProperty({ example: 'Buy' })
  side: string;

  @ApiProperty({ type: String, example: '64000.5' })
  price: string;

  @ApiProperty({ type: String, example: '0.25' })
  qty: string;

  @ApiProperty({ type: String, example: '0.088' })
  fee: string;

  @ApiProperty({ example: 'USDT', nullable: true })
  feeCurrency: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  execTime: Date;
}

export class TradeFundingSummaryDto {
  @ApiProperty({ example: -0.42, description: 'Sum of funding fees over the filtered window' })
  totalFee: number;

  @ApiProperty({ example: 27, description: 'Number of funding settlements folded into totalFee' })
  count: number;
}

export class TradeExecutionListResponseDto {
  @ApiProperty({ type: [TradeExecutionResponseDto], description: 'Real fills only — execType=Trade' })
  items: TradeExecutionResponseDto[];

  @ApiProperty({ example: 512, description: 'Count of items (fills), not including funding rows' })
  total: number;

  @ApiProperty({ type: TradeFundingSummaryDto })
  funding: TradeFundingSummaryDto;
}

export class HoldingResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440060' })
  id: string;

  @ApiProperty({ example: 'BTC' })
  asset: string;

  @ApiProperty({ type: String, example: '0.5', description: 'Decimal as string' })
  amount: string;

  @ApiProperty({ type: String, example: '60000', nullable: true })
  avgBuyPrice: string | null;

  @ApiProperty({ example: 'Cold wallet' })
  location: string;

  @ApiProperty({ example: 'Long-term stash', nullable: true })
  note: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

// A holding valued at the current market price (GET /investing/holdings).
export class HoldingWithValueResponseDto extends HoldingResponseDto {
  @ApiProperty({
    example: 67450.2,
    nullable: true,
    description: 'Current price per unit in USD; null if no USDT ticker / prices unavailable',
  })
  price: number | null;

  @ApiProperty({ example: 33725.1, nullable: true, description: 'amount × price' })
  value: number | null;

  @ApiProperty({ example: 3725.1, nullable: true, description: 'Unrealized PnL vs avgBuyPrice' })
  pnlUsd: number | null;

  @ApiProperty({ example: 12.42, nullable: true, description: 'Unrealized PnL in percent' })
  pnlPct: number | null;
}

export class HoldingListResponseDto {
  @ApiProperty({ type: [HoldingWithValueResponseDto] })
  items: HoldingWithValueResponseDto[];

  @ApiProperty({ example: 41200.55, description: 'Total USD value of the priced items' })
  totalValue: number;
}
