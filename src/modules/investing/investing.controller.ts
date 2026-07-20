import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { endOfDay } from '../currency/summary.util';
import { InvestingAccessGuard } from '../subscriptions/guards/investing-access.guard';
import { CreateExchangeAccountDto } from './dto/create-exchange-account.dto';
import { CreateHoldingDto, UpdateHoldingDto } from './dto/holding.dto';
import {
  ClosedPositionListResponseDto,
  ClosedPositionResponseDto,
  ExchangeAccountResponseDto,
  HoldingListResponseDto,
  HoldingResponseDto,
  TradeExecutionListResponseDto,
} from './dto/investing-response.dto';
import { CreateManualPositionDto, UpdateManualPositionDto } from './dto/manual-position.dto';
import { UpdateExchangeAccountDto } from './dto/update-exchange-account.dto';
import { InvestingService } from './investing.service';

@ApiTags('investing')
@Controller('investing')
@UseGuards(InvestingAccessGuard)
export class InvestingController {
  constructor(private readonly investingService: InvestingService) {}

  @Post('accounts')
  @ApiOperation({
    summary: 'Connect a Bybit account',
    description:
      'Stores a Bybit API key. The key is validated against Bybit before saving and MUST be ' +
      'read-only — keys with trade/withdraw permissions are rejected with 400. Trade history is ' +
      'backfilled as far back as Bybit retains it (up to ~2 years), not just from registration. ' +
      'The initial backfill runs in the background — watch status/lastSyncAt in GET ' +
      '/investing/accounts. The secret is stored encrypted and never returned.',
  })
  @ApiCreatedResponse({ type: ExchangeAccountResponseDto })
  addAccount(@CurrentUser() user: { id: string }, @Body() dto: CreateExchangeAccountDto) {
    return this.investingService.addAccount(user.id, dto);
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Connected exchange accounts',
    description:
      'All connected accounts with sync status. status=ERROR + lastError means the last sync ' +
      'failed (e.g. the key was revoked); the key itself is shown masked.',
  })
  @ApiOkResponse({ type: [ExchangeAccountResponseDto] })
  listAccounts(@CurrentUser() user: { id: string }) {
    return this.investingService.listAccounts(user.id);
  }

  @Patch('accounts/:id')
  @ApiOperation({
    summary: 'Rename a connected account',
    description:
      'Changes the display label only — everything else (key, sync status, history) is ' +
      'untouched. label is required and cannot be blank; a foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ type: ExchangeAccountResponseDto })
  renameAccount(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateExchangeAccountDto,
  ) {
    return this.investingService.renameAccount(user.id, id, dto);
  }

  @Delete('accounts/:id')
  @ApiOperation({
    summary: 'Disconnect an exchange account',
    description:
      'Deletes the account together with all synced trades and positions. Reconnecting the same ' +
      'key re-syncs the history. A foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  removeAccount(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.investingService.removeAccount(user.id, id);
  }

  @Post('accounts/:id/sync')
  @ApiOperation({
    summary: 'Sync an account now',
    description:
      'Runs the sync immediately instead of waiting for the next scheduled run (every 2 minutes). ' +
      'Returns the account with the updated sync status.',
  })
  @ApiOkResponse({ type: ExchangeAccountResponseDto })
  syncNow(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.investingService.syncNow(user.id, id);
  }

  @Get('positions')
  @ApiOperation({
    summary: 'Closed positions (the diary)',
    description:
      'Closed positions with realized PnL, newest first: derivatives (PnL from Bybit), spot ' +
      '(round trips derived from fills by FIFO, category=spot) and manual entries. Filters: ' +
      'accountId, symbol (e.g. BTCUSDT), from/to — closing date range (inclusive, either bound ' +
      'may be omitted). Pagination via limit/offset; total carries the full count for the filter.',
  })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'symbol', required: false, example: 'BTCUSDT' })
  @ApiQuery({ name: 'from', required: false, example: '2026-07-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-07-31' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkResponse({ type: ClosedPositionListResponseDto })
  getPositions(
    @CurrentUser() user: { id: string },
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.investingService.getPositions(user.id, {
      accountId,
      symbol,
      from: from ? new Date(from) : undefined,
      to: to ? endOfDay(to) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('positions')
  @ApiOperation({
    summary: 'Add a manual trade to the diary',
    description:
      "For trades made outside connected exchanges. direction is long/short from the trader's " +
      'point of view; PnL may be set explicitly (to account for fees) or is computed from the ' +
      'prices and size. Manual entries live in the same list as synced ones (source=manual) and ' +
      'are counted in the same statistics.',
  })
  @ApiCreatedResponse({ type: ClosedPositionResponseDto })
  addManualPosition(@CurrentUser() user: { id: string }, @Body() dto: CreateManualPositionDto) {
    return this.investingService.addManualPosition(user.id, dto);
  }

  @Patch('positions/:id')
  @ApiOperation({
    summary: 'Edit a manual trade',
    description:
      'Only source=manual entries can be edited — synced ones are owned by the exchange sync ' +
      '(400 otherwise). PnL is recomputed when prices/size/direction change, unless sent explicitly.',
  })
  @ApiOkResponse({ type: ClosedPositionResponseDto })
  updateManualPosition(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateManualPositionDto,
  ) {
    return this.investingService.updateManualPosition(user.id, id, dto);
  }

  @Delete('positions/:id')
  @ApiOperation({
    summary: 'Delete a manual trade',
    description: 'Only source=manual entries can be deleted (400 otherwise). A foreign id → 404.',
  })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  removeManualPosition(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.investingService.removeManualPosition(user.id, id);
  }

  @Get('holdings')
  @ApiOperation({
    summary: 'Manually tracked portfolio',
    description:
      'Assets the user tracks by hand (wallets, staking, other exchanges), valued at current ' +
      'Bybit spot prices in USD. price/value/pnl are null when the asset has no USDT ticker or ' +
      'prices are temporarily unavailable; totalValue sums the priced items.',
  })
  @ApiOkResponse({ type: HoldingListResponseDto })
  listHoldings(@CurrentUser() user: { id: string }) {
    return this.investingService.listHoldings(user.id);
  }

  @Post('holdings')
  @ApiOperation({
    summary: 'Add an asset to the portfolio',
    description:
      'asset is a ticker (BTC, ETH, SOL…). avgBuyPrice is optional — without it the position has ' +
      'no PnL, only the current value.',
  })
  @ApiCreatedResponse({ type: HoldingResponseDto })
  addHolding(@CurrentUser() user: { id: string }, @Body() dto: CreateHoldingDto) {
    return this.investingService.addHolding(user.id, dto);
  }

  @Patch('holdings/:id')
  @ApiOperation({
    summary: 'Edit a portfolio asset',
    description: 'Partial update — send only the fields being changed. A foreign id → 404.',
  })
  @ApiOkResponse({ type: HoldingResponseDto })
  updateHolding(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateHoldingDto,
  ) {
    return this.investingService.updateHolding(user.id, id, dto);
  }

  @Delete('holdings/:id')
  @ApiOperation({
    summary: 'Remove an asset from the portfolio',
    description: 'A foreign or non-existent id → 404.',
  })
  @ApiOkResponse({ schema: { example: { deleted: true } } })
  removeHolding(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.investingService.removeHolding(user.id, id);
  }

  @Get('trades')
  @ApiOperation({
    summary: 'Individual fills',
    description:
      'Real order executions (fills) behind the positions — for the detailed view of a trade. ' +
      'Same filters and pagination as /investing/positions; from/to filter by execution time. ' +
      'Funding-fee settlements (execType=Funding) are excluded from items and rolled up into ' +
      'funding.totalFee/count instead, covering the full filtered window regardless of pagination.',
  })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'symbol', required: false, example: 'BTCUSDT' })
  @ApiQuery({ name: 'from', required: false, example: '2026-07-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-07-31' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiOkResponse({ type: TradeExecutionListResponseDto })
  getTrades(
    @CurrentUser() user: { id: string },
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.investingService.getTrades(user.id, {
      accountId,
      symbol,
      from: from ? new Date(from) : undefined,
      to: to ? endOfDay(to) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
