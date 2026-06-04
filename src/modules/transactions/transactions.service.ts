import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GetTransactionsDto, TransactionType } from './dto/get-transactions.dto';

export interface TransactionRow {
  id: string;
  categoryId: string;
  categoryName: string | null;
  amount: number;
  currency: string;
  description: string;
  date: Date;
  type: 'income' | 'expense';
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, dto: GetTransactionsDto) {
    const { type, categoryId, search, from, to } = dto;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const expenseWhere = this.buildWhere('e', userId, categoryId, search, from, to);
    const incomePart = this.buildWhere('i', userId, categoryId, search, from, to);

    const expensePart = Prisma.sql`
      SELECT
        e.id,
        e.category_id AS "categoryId",
        ec.name AS "categoryName",
        e.amount::float8 AS amount,
        e.currency,
        e.description,
        e.date,
        'expense'::text AS type
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
        'income'::text AS type
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

    const [items, countResult] = await Promise.all([
      this.prisma.$queryRaw<TransactionRow[]>`
        ${union}
        ORDER BY date DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count FROM (${union}) AS combined
      `,
    ]);

    return {
      items,
      total: Number(countResult[0].count),
      page,
      limit,
      totalPages: Math.ceil(Number(countResult[0].count) / limit),
    };
  }

  private buildWhere(
    alias: string,
    userId: string,
    categoryId?: string,
    search?: string,
    from?: string,
    to?: string,
  ): Prisma.Sql {
    const a = Prisma.raw(alias);
    const conditions: Prisma.Sql[] = [Prisma.sql`${a}.user_id::text = ${userId}`];

    if (categoryId) {
      conditions.push(Prisma.sql`${a}.category_id::text = ${categoryId}`);
    }

    if (search) {
      conditions.push(Prisma.sql`${a}.description ILIKE ${`%${search}%`}`);
    }

    if (from) {
      conditions.push(Prisma.sql`${a}.date >= ${new Date(from)}`);
    }

    if (to) {
      conditions.push(Prisma.sql`${a}.date <= ${new Date(to)}`);
    }

    return Prisma.join(conditions, ' AND ');
  }
}
