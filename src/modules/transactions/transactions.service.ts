import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { GoalsService } from '../goals/goals.service';
import { GetTransactionsDto, TransactionType } from './dto/get-transactions.dto';

/** Amount for a single currency, for converting to the base (see CurrencyService.approxTotalInBase). */
interface CurrencyGroup {
  currency: string;
  amount: number;
  amountUsd: number | null;
}

export interface TransactionRow {
  id: string;
  categoryId: string;
  categoryName: string | null;
  amount: number;
  currency: string;
  description: string;
  date: Date;
  createdAt: Date;
  type: 'income' | 'expense';
  // USD snapshot at creation time — internal, used for the summary; stripped from the response.
  amountUsd: number | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
    private readonly goals: GoalsService,
  ) {}

  async findAll(userId: string, dto: GetTransactionsDto) {
    const { type, categoryId, search, currency, from, to } = dto;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const expenseWhere = this.buildWhere('e', userId, categoryId, search, currency, from, to);
    const incomePart = this.buildWhere('i', userId, categoryId, search, currency, from, to);

    const expensePart = Prisma.sql`
      SELECT
        e.id,
        e.category_id AS "categoryId",
        ec.name AS "categoryName",
        e.amount::float8 AS amount,
        e.currency,
        e.description,
        e.date,
        e.created_at AS "createdAt",
        'expense'::text AS type,
        e.amount_usd::float8 AS "amountUsd"
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE ${expenseWhere}
    `;

    const incomePartQuery = Prisma.sql`
      SELECT
        i.id,
        i.category_id AS "categoryId",
        ic.name AS "categoryName",
        i.amount::float8 AS amount,
        i.currency,
        i.description,
        i.date,
        i.created_at AS "createdAt",
        'income'::text AS type,
        i.amount_usd::float8 AS "amountUsd"
      FROM incomes i
      LEFT JOIN income_categories ic ON ic.id = i.category_id
      WHERE ${incomePart}
    `;

    const union =
      type === TransactionType.EXPENSE
        ? expensePart
        : type === TransactionType.INCOME
          ? incomePartQuery
          : Prisma.sql`${expensePart} UNION ALL ${incomePartQuery}`;

    const [items, countResult, user, rates] = await Promise.all([
      this.prisma.$queryRaw<TransactionRow[]>`
        ${union}
        ORDER BY date DESC, "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count FROM (${union}) AS combined
      `,
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
    ]);

    const baseCurrency = user?.currency ?? 'USD';
    // The monetary total is computed over the current page (items), not the whole result set.
    const incomeRows = items.filter((r) => r.type === 'income');
    const expenseRows = items.filter((r) => r.type === 'expense');
    const income = this.currency.approxTotalInBase(incomeRows, baseCurrency, rates, 'income');
    const expense = this.currency.approxTotalInBase(expenseRows, baseCurrency, rates, 'expense');
    // net is known only if both totals were computed (rates available).
    const net =
      income === null || expense === null ? null : Math.round((income - expense) * 100) / 100;

    return {
      // amountUsd is internal (used for the summary above) — keep it out of the response.
      items: items.map(({ amountUsd: _amountUsd, ...row }) => row),
      total: Number(countResult[0].count),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0].count) / limit),
      summary: { baseCurrency, income, expense, net },
    };
  }

  // Overall all-time balance: income − expenses. Computed via the USD snapshot (amountUsd)
  // and returned both in USD and in the user's base currency.
  async getBalance(userId: string) {
    const [incomeGroups, expenseGroups, user, rates, goalRows] = await Promise.all([
      this.prisma.income.groupBy({
        by: ['currency'],
        where: { userId },
        _sum: { amount: true, amountUsd: true },
      }),
      this.prisma.expense.groupBy({
        by: ['currency'],
        where: { userId },
        _sum: { amount: true, amountUsd: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
      this.goals.reservedRows(userId),
    ]);

    const toRows = (groups: typeof incomeGroups): CurrencyGroup[] =>
      groups.map((g) => ({
        currency: g.currency,
        amount: Number(g._sum.amount ?? 0),
        amountUsd: g._sum.amountUsd != null ? Number(g._sum.amountUsd) : null,
      }));

    const baseCurrency = user?.currency ?? 'USD';
    const incomeRows = toRows(incomeGroups);
    const expenseRows = toRows(expenseGroups);

    // In USD and in the base currency — with a spread adjustment for cross-currency rows
    // (income ×1−spread, expense ×1+spread); single-currency rows are taken as-is.
    // Goals (model A — transfer): money allocated to active goals is reserved, so it is
    // subtracted from the free balance. Net worth (income − expense) splits into free + inGoals.
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const sub = (a: number | null, b: number | null, c: number | null) =>
      a === null || b === null || c === null ? null : round2(a - b - c);

    const incomeUsd = this.currency.approxTotalInBase(incomeRows, 'USD', rates, 'income');
    const expenseUsd = this.currency.approxTotalInBase(expenseRows, 'USD', rates, 'expense');
    const goalsUsd = this.currency.approxTotalInBase(goalRows, 'USD', rates, 'none');
    const balanceUsd = sub(incomeUsd, expenseUsd, goalsUsd);

    const incomeBase = this.currency.approxTotalInBase(incomeRows, baseCurrency, rates, 'income');
    const expenseBase = this.currency.approxTotalInBase(
      expenseRows,
      baseCurrency,
      rates,
      'expense',
    );
    const goalsBase = this.currency.approxTotalInBase(goalRows, baseCurrency, rates, 'none');
    const balance = sub(incomeBase, expenseBase, goalsBase);

    return { baseCurrency, balanceUsd, balance, inGoals: goalsBase, inGoalsUsd: goalsUsd };
  }

  private buildWhere(
    alias: string,
    userId: string,
    categoryId?: string[],
    search?: string,
    currency?: string[],
    from?: string,
    to?: string,
  ): Prisma.Sql {
    const a = Prisma.raw(alias);
    const conditions: Prisma.Sql[] = [Prisma.sql`${a}.user_id::text = ${userId}`];

    if (categoryId?.length) {
      conditions.push(Prisma.sql`${a}.category_id::text IN (${Prisma.join(categoryId)})`);
    }

    if (search) {
      conditions.push(Prisma.sql`${a}.description ILIKE ${`%${search}%`}`);
    }

    if (currency?.length) {
      conditions.push(Prisma.sql`${a}.currency IN (${Prisma.join(currency)})`);
    }

    // date — a DATE column (no time), compare bounds by day (inclusive on both sides).
    if (from) {
      conditions.push(Prisma.sql`${a}.date >= ${new Date(from)}::date`);
    }

    if (to) {
      conditions.push(Prisma.sql`${a}.date <= ${new Date(to)}::date`);
    }

    return Prisma.join(conditions, ' AND ');
  }
}
