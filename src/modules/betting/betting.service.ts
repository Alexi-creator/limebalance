import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Bet, BetStatus, type ExternalAccount, type ExternalTransfer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService, type Rates } from '../currency/currency.service';
import {
  BettingAccountDto,
  BettingAccountsResponseDto,
  CreateBettingAccountDto,
  UpdateBettingAccountDto,
} from './dto/account.dto';
import { BetDto, BetsResponseDto, BetsSummaryDto, CreateBetDto, UpdateBetDto } from './dto/bet.dto';
import { CreateTransferDto, TransferDto } from './dto/transfer.dto';

const round2 = (v: number) => Math.round(v * 100) / 100;

const MAX_PAGE = 200;

export interface CurrencyRow {
  currency: string;
  amount: number;
}

/** Per-account aggregates, all derived — nothing here is stored on the account row. */
interface AccountStats {
  /** Deposits minus withdrawals. Negative once more has been taken out than was put in. */
  transferred: number;
  /** Realized: payout − stake over settled bets. */
  pnl: number;
  pendingStake: number;
  settledCount: number;
  pendingCount: number;
}

const EMPTY_STATS: AccountStats = {
  transferred: 0,
  pnl: 0,
  pendingStake: 0,
  settledCount: 0,
  pendingCount: 0,
};

export interface BetsQuery {
  accountId?: string;
  status?: BetStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Betting bankroll: money that left the ledger to work in someone else's system.
 *
 * Three deliberate choices, each of which the obvious alternative gets wrong:
 *
 * - **Not a goal.** A goal's reserve is by definition the sum of its contributions, so a bankroll
 *   modelled as one would have to book winnings as "contributions" and lose the difference between
 *   "I put more money in" and "the money earned". A bankroll has PnL; a goal cannot.
 * - **Not income/expense.** A deposit changes no net worth, it moves pockets — booking it would
 *   inflate the month's expenses and poison every report, the same reason CurrencyExchange stays
 *   out of both. Profit reaches the free balance only when it is actually withdrawn.
 * - **Nothing is stored.** Account value is recomputed from transfers + bets on every read, the
 *   same stateless-rebuild pattern the investing sync uses for spot positions, so there is no
 *   running total to drift out of sync with the rows behind it.
 */
@Injectable()
export class BettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  // --- accounts ---

  async listAccounts(userId: string): Promise<BettingAccountsResponseDto> {
    const [accounts, statsById, user, rates] = await Promise.all([
      this.prisma.externalAccount.findMany({
        where: { userId },
        orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
      }),
      this.statsByAccount(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
    ]);

    const items = accounts.map((a) => this.toAccountDto(a, statsById.get(a.id) ?? EMPTY_STATS));
    const baseCurrency = user?.currency ?? 'USD';
    // Each figure is rolled up from the per-account rows in their own currencies — never from the
    // already-converted totals, which would compound the conversion.
    const inBase = (pick: (i: BettingAccountDto) => number): number | null =>
      this.sumIntoBase(
        items.map((i) => ({ currency: i.currency, amount: pick(i) })),
        baseCurrency,
        rates,
      );

    return {
      items,
      summary: {
        baseCurrency,
        value: inBase((i) => i.value),
        transferred: inBase((i) => i.transferred),
        pnl: inBase((i) => i.pnl),
        isApproximate: items.some((i) => i.currency !== baseCurrency),
      },
    };
  }

  async createAccount(userId: string, dto: CreateBettingAccountDto): Promise<BettingAccountDto> {
    const account = await this.prisma.externalAccount.create({
      data: {
        userId,
        name: dto.name,
        emoji: dto.emoji ?? null,
        currency: dto.currency,
        ...(dto.kind ? { kind: dto.kind } : {}),
      },
    });
    return this.toAccountDto(account, EMPTY_STATS);
  }

  async updateAccount(
    userId: string,
    id: string,
    dto: UpdateBettingAccountDto,
  ): Promise<BettingAccountDto> {
    await this.ownedAccount(userId, id);
    // Currency is intentionally not updatable: every transfer and bet under the account is
    // denominated in it, so changing it would silently reinterpret the whole history.
    const account = await this.prisma.externalAccount.update({
      where: { id },
      data: { name: dto.name, emoji: dto.emoji, archived: dto.archived },
    });
    return this.toAccountDto(
      account,
      (await this.statsByAccount(userId, id)).get(id) ?? EMPTY_STATS,
    );
  }

  async removeAccount(userId: string, id: string): Promise<{ success: true }> {
    await this.ownedAccount(userId, id);
    const stats = (await this.statsByAccount(userId, id)).get(id) ?? EMPTY_STATS;
    // Deleting an account with money still in it would release its reserve and make the free
    // balance jump as if the money had come back. Withdraw it first — then the delete is neutral.
    if (round2(stats.transferred) !== 0) {
      throw new BadRequestException(
        'The account still holds money. Withdraw it back to the balance before deleting.',
      );
    }
    await this.prisma.externalAccount.delete({ where: { id } });
    return { success: true };
  }

  // --- transfers ---

  async listTransfers(userId: string, accountId: string): Promise<TransferDto[]> {
    const account = await this.ownedAccount(userId, accountId);
    const rows = await this.prisma.externalTransfer.findMany({
      where: { accountId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toTransferDto(r, account.currency));
  }

  /** Deposit (positive) or withdrawal (negative). The one operation that touches the balance. */
  async transfer(userId: string, accountId: string, dto: CreateTransferDto): Promise<TransferDto> {
    const account = await this.ownedAccount(userId, accountId);
    if (dto.amount === 0) throw new BadRequestException('amount must not be zero');

    if (dto.amount < 0) {
      const stats = (await this.statsByAccount(userId, accountId)).get(accountId) ?? EMPTY_STATS;
      const available = round2(stats.transferred + stats.pnl - stats.pendingStake);
      if (-dto.amount > available) {
        throw new BadRequestException(
          `Withdrawal exceeds what the account has free (${available} ${account.currency})`,
        );
      }
    }

    const row = await this.prisma.externalTransfer.create({
      data: {
        accountId,
        userId,
        amount: dto.amount,
        note: dto.note ?? null,
        date: dto.date ?? new Date(),
      },
    });
    return this.toTransferDto(row, account.currency);
  }

  async removeTransfer(userId: string, id: string): Promise<{ success: true }> {
    const row = await this.prisma.externalTransfer.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Transfer ${id} not found`);
    await this.prisma.externalTransfer.delete({ where: { id } });
    return { success: true };
  }

  // --- bets ---

  async listBets(userId: string, query: BetsQuery): Promise<BetsResponseDto> {
    const where = {
      userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { placedAt: { gte: query.from, lte: query.to } } : {}),
    };

    const [rows, total, summary] = await Promise.all([
      this.prisma.bet.findMany({
        where,
        orderBy: [{ placedAt: 'desc' }, { createdAt: 'desc' }],
        include: { account: { select: { currency: true } } },
        take: Math.min(query.limit ?? 50, MAX_PAGE),
        skip: query.offset ?? 0,
      }),
      this.prisma.bet.count({ where }),
      this.betsSummary(where),
    ]);

    return {
      items: rows.map((r) => this.toBetDto(r, r.account.currency)),
      total,
      summary,
    };
  }

  async createBet(userId: string, accountId: string, dto: CreateBetDto): Promise<BetDto> {
    const account = await this.ownedAccount(userId, accountId);
    const status = dto.status ?? BetStatus.PENDING;
    const payout = this.resolvePayout(status, dto.stake, dto.odds, dto.payout);

    // Deliberately NOT checking the stake against the account's free money: bets get backfilled in
    // whatever order the user has them written down, and a bookmaker freebet or bonus legitimately
    // stakes money the account never held. The withdrawal check above is where integrity matters.
    const bet = await this.prisma.bet.create({
      data: {
        accountId,
        userId,
        event: dto.event,
        market: dto.market ?? '',
        stake: dto.stake,
        odds: dto.odds,
        status,
        payout,
        note: dto.note ?? null,
        placedAt: dto.placedAt ?? new Date(),
        settledAt: status === BetStatus.PENDING ? null : new Date(),
      },
    });
    return this.toBetDto(bet, account.currency);
  }

  /** Edits a bet and, when `status` moves off PENDING, settles it. */
  async updateBet(userId: string, id: string, dto: UpdateBetDto): Promise<BetDto> {
    const existing = await this.prisma.bet.findFirst({
      where: { id, userId },
      include: { account: { select: { currency: true } } },
    });
    if (!existing) throw new NotFoundException(`Bet ${id} not found`);

    const status = dto.status ?? existing.status;
    const stake = dto.stake ?? Number(existing.stake);
    const odds = dto.odds ?? Number(existing.odds);
    // An explicit payout wins; otherwise it is re-derived whenever the status changes, and left
    // alone when only, say, the note was edited.
    const payout =
      dto.payout !== undefined || dto.status !== undefined
        ? this.resolvePayout(status, stake, odds, dto.payout)
        : existing.payout === null
          ? null
          : Number(existing.payout);

    const settledAt =
      status === BetStatus.PENDING
        ? null // un-settling: the bet is open again and has no result
        : (dto.settledAt ?? existing.settledAt ?? new Date());

    const bet = await this.prisma.bet.update({
      where: { id },
      data: {
        event: dto.event,
        market: dto.market,
        stake: dto.stake,
        odds: dto.odds,
        status,
        payout,
        note: dto.note,
        settledAt,
      },
    });
    return this.toBetDto(bet, existing.account.currency);
  }

  async removeBet(userId: string, id: string): Promise<{ success: true }> {
    const bet = await this.prisma.bet.findFirst({ where: { id, userId } });
    if (!bet) throw new NotFoundException(`Bet ${id} not found`);
    await this.prisma.bet.delete({ where: { id } });
    return { success: true };
  }

  // --- balance integration ---

  /**
   * What the free balance needs to know, per currency:
   *
   * - `transferred` — net moved out of the ledger into external accounts. The balance subtracts
   *   this and nothing else, which is what makes a withdrawn profit show up as free money without
   *   ever being booked as income.
   * - `value` — what those accounts are worth now (transferred + realized PnL). Reported as
   *   `inBetting` so net worth = balance + inGoals + inBetting.
   *
   * Archived accounts are included on purpose: hiding a card must not conjure money back.
   */
  async balanceRows(userId: string): Promise<{ transferred: CurrencyRow[]; value: CurrencyRow[] }> {
    const accounts = await this.prisma.externalAccount.findMany({
      where: { userId },
      select: { id: true, currency: true },
    });
    if (!accounts.length) return { transferred: [], value: [] };

    const statsById = await this.statsByAccount(userId);
    const transferred = new Map<string, number>();
    const value = new Map<string, number>();
    for (const a of accounts) {
      const s = statsById.get(a.id) ?? EMPTY_STATS;
      transferred.set(a.currency, (transferred.get(a.currency) ?? 0) + s.transferred);
      value.set(a.currency, (value.get(a.currency) ?? 0) + s.transferred + s.pnl);
    }
    const toRows = (m: Map<string, number>): CurrencyRow[] =>
      [...m].map(([currency, amount]) => ({ currency, amount: round2(amount) }));
    return { transferred: toRows(transferred), value: toRows(value) };
  }

  // --- internals ---

  private async ownedAccount(userId: string, id: string): Promise<ExternalAccount> {
    const account = await this.prisma.externalAccount.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  /**
   * Every account's aggregates in two queries, regardless of how many accounts or bets there are:
   * one grouped sum of transfers, one grouped sum of bets per (account, status).
   */
  private async statsByAccount(
    userId: string,
    accountId?: string,
  ): Promise<Map<string, AccountStats>> {
    const scope = { userId, ...(accountId ? { accountId } : {}) };
    const [transferGroups, betGroups] = await Promise.all([
      this.prisma.externalTransfer.groupBy({
        by: ['accountId'],
        where: scope,
        _sum: { amount: true },
      }),
      this.prisma.bet.groupBy({
        by: ['accountId', 'status'],
        where: scope,
        _sum: { stake: true, payout: true },
        _count: true,
      }),
    ]);

    const result = new Map<string, AccountStats>();
    const statsFor = (id: string): AccountStats => {
      const existing = result.get(id);
      if (existing) return existing;
      const fresh = { ...EMPTY_STATS };
      result.set(id, fresh);
      return fresh;
    };

    for (const g of transferGroups) {
      statsFor(g.accountId).transferred = Number(g._sum.amount ?? 0);
    }
    for (const g of betGroups) {
      const stats = statsFor(g.accountId);
      const stake = Number(g._sum.stake ?? 0);
      if (g.status === BetStatus.PENDING) {
        stats.pendingStake += stake;
        stats.pendingCount += g._count;
        continue;
      }
      // A settled bet always has a payout (resolvePayout guarantees it); a NULL one would be a
      // row written before that rule existed, and reads as a total loss — the same as payout 0.
      stats.pnl += Number(g._sum.payout ?? 0) - stake;
      stats.settledCount += g._count;
    }
    for (const stats of result.values()) {
      stats.transferred = round2(stats.transferred);
      stats.pnl = round2(stats.pnl);
      stats.pendingStake = round2(stats.pendingStake);
    }
    return result;
  }

  /** Winrate / ROI over exactly the rows the filter matched — never over the current page only. */
  private async betsSummary(where: object): Promise<BetsSummaryDto> {
    const [groups, oddsAgg] = await Promise.all([
      this.prisma.bet.groupBy({
        by: ['status'],
        where,
        _sum: { stake: true, payout: true },
        _count: true,
      }),
      this.prisma.bet.aggregate({ where, _avg: { odds: true } }),
    ]);

    const byStatus = new Map(groups.map((g) => [g.status, g]));
    const count = (status: BetStatus) => byStatus.get(status)?._count ?? 0;
    const stake = (status: BetStatus) => Number(byStatus.get(status)?._sum.stake ?? 0);

    const wonCount = count(BetStatus.WON);
    const lostCount = count(BetStatus.LOST);
    const pendingCount = count(BetStatus.PENDING);
    const settledCount = groups
      .filter((g) => g.status !== BetStatus.PENDING)
      .reduce((sum, g) => sum + g._count, 0);

    // A voided stake was returned in full, so it never really was at risk — counting it as
    // turnover would dilute ROI with money that was never exposed.
    const turnover = round2(
      stake(BetStatus.WON) + stake(BetStatus.LOST) + stake(BetStatus.CASHOUT),
    );
    const pnl = round2(
      groups
        .filter((g) => g.status !== BetStatus.PENDING)
        .reduce((sum, g) => sum + Number(g._sum.payout ?? 0) - Number(g._sum.stake ?? 0), 0),
    );

    const decided = wonCount + lostCount;
    return {
      count: settledCount + pendingCount,
      settledCount,
      pendingCount,
      wonCount,
      lostCount,
      voidCount: count(BetStatus.VOID),
      cashoutCount: count(BetStatus.CASHOUT),
      turnover,
      pnl,
      winRate: decided === 0 ? null : round2((wonCount / decided) * 100),
      roi: turnover === 0 ? null : round2((pnl / turnover) * 100),
      avgOdds:
        oddsAgg._avg.odds === null ? null : Math.round(Number(oddsAgg._avg.odds) * 1000) / 1000,
    };
  }

  /**
   * What a settled bet actually returned, stake included. Derivable from the status for everything
   * except a cashout, whose payout is whatever the bookmaker happened to offer.
   */
  private resolvePayout(
    status: BetStatus,
    stake: number,
    odds: number,
    given?: number,
  ): number | null {
    if (status === BetStatus.PENDING) return null;
    if (given !== undefined) return round2(given);
    switch (status) {
      case BetStatus.WON:
        return round2(stake * odds);
      case BetStatus.LOST:
        return 0;
      case BetStatus.VOID:
        return round2(stake);
      default:
        throw new BadRequestException('A cashout needs its payout — it cannot be derived');
    }
  }

  private toAccountDto(account: ExternalAccount, stats: AccountStats): BettingAccountDto {
    const value = round2(stats.transferred + stats.pnl);
    return {
      id: account.id,
      name: account.name,
      emoji: account.emoji,
      kind: account.kind,
      currency: account.currency,
      archived: account.archived,
      transferred: stats.transferred,
      value,
      pnl: stats.pnl,
      pendingStake: stats.pendingStake,
      available: round2(value - stats.pendingStake),
      settledCount: stats.settledCount,
      pendingCount: stats.pendingCount,
      createdAt: account.createdAt,
    };
  }

  private toTransferDto(row: ExternalTransfer, currency: string): TransferDto {
    return {
      id: row.id,
      accountId: row.accountId,
      amount: Number(row.amount),
      currency,
      note: row.note,
      date: row.date,
    };
  }

  private toBetDto(bet: Bet, currency: string): BetDto {
    const stake = Number(bet.stake);
    const payout = bet.payout === null ? null : Number(bet.payout);
    return {
      id: bet.id,
      accountId: bet.accountId,
      event: bet.event,
      market: bet.market,
      stake,
      odds: Number(bet.odds),
      status: bet.status,
      currency,
      payout,
      // An undecided bet has no result — 0 would read as a breakeven that already happened.
      pnl: bet.status === BetStatus.PENDING || payout === null ? null : round2(payout - stake),
      note: bet.note,
      placedAt: bet.placedAt,
      settledAt: bet.settledAt,
    };
  }

  /** Base-currency rows exactly as they are, foreign ones at today's rate. null if rates are missing. */
  private sumIntoBase(
    rows: CurrencyRow[],
    baseCurrency: string,
    rates: Rates | null,
  ): number | null {
    let total = 0;
    for (const row of rows) {
      if (row.currency === baseCurrency) {
        total += row.amount;
        continue;
      }
      if (!rates) return null;
      const converted = this.currency.convertWithRates(
        rates,
        row.amount,
        row.currency,
        baseCurrency,
      );
      if (converted === null) return null;
      total += converted;
    }
    return round2(total);
  }
}
