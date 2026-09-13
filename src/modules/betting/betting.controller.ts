import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { BetStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { endOfDay } from '../currency/summary.util';
import { BettingService } from './betting.service';
import {
  BettingAccountDto,
  BettingAccountsResponseDto,
  CreateBettingAccountDto,
  UpdateBettingAccountDto,
} from './dto/account.dto';
import { BetDto, BetsResponseDto, CreateBetDto, UpdateBetDto } from './dto/bet.dto';
import { CreateTransferDto, TransferDto } from './dto/transfer.dto';

@ApiTags('betting')
@Controller('betting')
export class BettingController {
  constructor(private readonly bettingService: BettingService) {}

  @Get('accounts')
  @ApiOperation({
    summary: 'Betting accounts with their bankroll',
    description:
      'Every external account, each with its derived bankroll: `transferred` is what was moved ' +
      'in from the balance, `pnl` what the bets made, `value` the two together, and `available` ' +
      'what is not locked in unsettled bets. Nothing here is stored — it is all recomputed from ' +
      'the transfers and bets, so these figures can never drift from the rows behind them.',
  })
  @ApiOkResponse({ type: BettingAccountsResponseDto })
  listAccounts(@CurrentUser() user: { id: string }) {
    return this.bettingService.listAccounts(user.id);
  }

  @Post('accounts')
  @ApiOperation({
    summary: 'Add a betting account',
    description:
      'Single-currency by design. To fund it from another currency, record a currency exchange ' +
      'first and then transfer in the account currency — that way every figure stays exact.',
  })
  @ApiCreatedResponse({ type: BettingAccountDto })
  createAccount(@CurrentUser() user: { id: string }, @Body() dto: CreateBettingAccountDto) {
    return this.bettingService.createAccount(user.id, dto);
  }

  @Patch('accounts/:id')
  @ApiOperation({
    summary: 'Rename or archive an account',
    description:
      'Currency cannot be changed — the whole history under the account is denominated in it. ' +
      'Archiving only hides the card: the money still counts against the free balance.',
  })
  @ApiOkResponse({ type: BettingAccountDto })
  updateAccount(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateBettingAccountDto,
  ) {
    return this.bettingService.updateAccount(user.id, id, dto);
  }

  @Delete('accounts/:id')
  @ApiOperation({
    summary: 'Delete an account',
    description:
      'Deletes its transfers and bets with it. Rejected with 400 while the account still holds ' +
      'money — withdraw it back to the balance first, so the delete cannot make the balance jump.',
  })
  removeAccount(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.bettingService.removeAccount(user.id, id);
  }

  @Get('accounts/:id/transfers')
  @ApiOperation({ summary: 'Deposits and withdrawals of one account, newest first' })
  @ApiOkResponse({ type: [TransferDto] })
  listTransfers(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.bettingService.listTransfers(user.id, id);
  }

  @Post('accounts/:id/transfers')
  @ApiOperation({
    summary: 'Move money to or from the account',
    description:
      'Positive deposits, negative withdraws. This is the only operation that touches the free ' +
      'balance — it is neither an income nor an expense, so no report is affected, exactly like a ' +
      'currency exchange. A withdrawal larger than the free money in the account is rejected.',
  })
  @ApiCreatedResponse({ type: TransferDto })
  transfer(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateTransferDto,
  ) {
    return this.bettingService.transfer(user.id, id, dto);
  }

  @Delete('transfers/:id')
  @ApiOperation({ summary: 'Delete a transfer' })
  removeTransfer(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.bettingService.removeTransfer(user.id, id);
  }

  @Get('bets')
  @ApiOperation({
    summary: 'Bets with winrate and ROI',
    description:
      'Paginated, newest first by placedAt. `summary` covers every bet matching the filter, not ' +
      'just the page. PENDING bets have pnl null — undecided, not breakeven.',
  })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'WON', 'LOST', 'VOID', 'CASHOUT'],
  })
  @ApiQuery({ name: 'from', required: false, description: 'Placed on or after (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Placed on or before (YYYY-MM-DD)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Default 50, max 200' })
  @ApiQuery({ name: 'offset', required: false })
  @ApiOkResponse({ type: BetsResponseDto })
  listBets(
    @CurrentUser() user: { id: string },
    @Query('accountId') accountId?: string,
    @Query('status') status?: BetStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.bettingService.listBets(user.id, {
      accountId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? endOfDay(to) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('accounts/:id/bets')
  @ApiOperation({
    summary: 'Record a bet',
    description:
      'PENDING by default — the stake is locked but nothing is realized yet. Pass a settled ' +
      'status to backfill a bet that is already decided; the payout is then derived from the ' +
      'status (stake × odds for WON, 0 for LOST, the stake for VOID) unless you send it.',
  })
  @ApiCreatedResponse({ type: BetDto })
  createBet(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateBetDto,
  ) {
    return this.bettingService.createBet(user.id, id, dto);
  }

  @Patch('bets/:id')
  @ApiOperation({
    summary: 'Settle or edit a bet',
    description:
      'Sending a settled status closes the bet and realizes payout − stake into the bankroll. ' +
      'Sending PENDING back reopens it and clears the result, so a mis-settled bet can be undone.',
  })
  @ApiOkResponse({ type: BetDto })
  updateBet(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateBetDto,
  ) {
    return this.bettingService.updateBet(user.id, id, dto);
  }

  @Delete('bets/:id')
  @ApiOperation({ summary: 'Delete a bet' })
  removeBet(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.bettingService.removeBet(user.id, id);
  }
}
