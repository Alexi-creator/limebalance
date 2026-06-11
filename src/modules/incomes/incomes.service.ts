import { Injectable, NotFoundException } from '@nestjs/common';
import { localWallClockNow } from '../../common/timezone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { aggregateSummary, buildBuckets, type Granularity } from '../currency/summary.util';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  async create(userId: string, dto: CreateIncomeDto) {
    const currency = dto.currency ?? (await this.resolveUserCurrency(userId));
    // Снапшот стоимости в USD по текущему курсу (фиксируется на момент создания).
    const amountUsd = await this.currency.convert(dto.amount, currency, 'USD');
    return this.prisma.income.create({ data: { ...dto, userId, currency, amountUsd } });
  }

  private async resolveUserCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true },
    });
    return user?.currency ?? 'USD';
  }

  findAllByUser(userId: string, from?: Date, to?: Date) {
    return this.prisma.income.findMany({
      where: {
        userId,
        ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSummary(userId: string, range: { from: Date; to: Date; granularity: Granularity }) {
    const { from, to, granularity } = range;

    const [rows, user, rates] = await Promise.all([
      this.prisma.income.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { amount: true, amountUsd: true, currency: true, date: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { currency: true } }),
      this.currency.getRates(),
    ]);

    const baseCurrency = user?.currency ?? 'USD';
    const bucketKeys = buildBuckets(from, to, granularity);
    return aggregateSummary(rows, bucketKeys, granularity, baseCurrency, rates, this.currency, 'income');
  }

  async findOne(id: string, userId: string) {
    const income = await this.prisma.income.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (!income) throw new NotFoundException(`Income ${id} not found`);
    return income;
  }

  async update(id: string, userId: string, dto: UpdateIncomeDto) {
    const existing = await this.findOne(id, userId);

    // Пересчитываем USD-снапшот только если изменились сумма или валюта.
    let amountUsd: number | null | undefined;
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const amount = dto.amount ?? Number(existing.amount);
      const currency = dto.currency ?? existing.currency;
      amountUsd = await this.currency.convert(amount, currency, 'USD');
    }

    return this.prisma.income.update({
      where: { id },
      data: { ...dto, ...(amountUsd !== undefined ? { amountUsd } : {}) },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.income.delete({ where: { id } });
  }

  // Массовое удаление: сначала проверяем, что все id принадлежат пользователю,
  // иначе 404 и ничего не удаляем (атомарно, в транзакции).
  async removeMany(userId: string, ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.income.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((e) => e.id));
      const missing = ids.filter((id) => !ownedIds.has(id));
      if (missing.length) {
        throw new NotFoundException(`Incomes not found: ${missing.join(', ')}`);
      }

      const { count } = await tx.income.deleteMany({ where: { id: { in: ids }, userId } });
      return { deleted: count };
    });
  }

  async statSummary(userId: string, categoryId: string | null, period: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true, timezone: true },
    });
    const baseCurrency = user?.currency ?? 'USD';
    const { from, to } = this.getPeriodDates(period, user?.timezone ?? 'UTC');

    const [grouped, rates] = await Promise.all([
      this.prisma.income.groupBy({
        by: ['categoryId', 'currency'],
        where: { userId, ...(categoryId ? { categoryId } : {}), date: { gte: from, lte: to } },
        _sum: { amount: true, amountUsd: true },
      }),
      this.currency.getRates(),
    ]);

    // categoryId -> разбивка по валютам (для пересчёта в базовую валюту)
    const groupsByCategory = new Map<
      string,
      { currency: string; amount: number; amountUsd: number | null }[]
    >();
    const allGroups: { currency: string; amount: number; amountUsd: number | null }[] = [];
    for (const g of grouped) {
      const row = {
        currency: g.currency,
        amount: Number(g._sum.amount ?? 0),
        amountUsd: g._sum.amountUsd != null ? Number(g._sum.amountUsd) : null,
      };
      const list = groupsByCategory.get(g.categoryId) ?? [];
      list.push(row);
      groupsByCategory.set(g.categoryId, list);
      allGroups.push(row);
    }

    const categories = await this.prisma.incomeCategory.findMany({
      where: { id: { in: [...groupsByCategory.keys()] } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(categories.map((c) => [c.id, c.name]));

    const items = [...groupsByCategory.entries()].map(([catId, groups]) => ({
      category: nameMap.get(catId) ?? '—',
      // Итог по категории в базовой валюте (прибл. по курсу). null, если курсы недоступны.
      total: this.currency.approxTotalInBase(groups, baseCurrency, rates, 'income'),
    }));

    return {
      baseCurrency,
      // Общий итог — одной конвертацией по всем строкам (совпадает с ЛК).
      total: this.currency.approxTotalInBase(allGroups, baseCurrency, rates, 'income'),
      items,
    };
  }

  async statDetails(userId: string, categoryId: string | null, period: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currency: true, timezone: true },
    });
    const baseCurrency = user?.currency ?? 'USD';
    const { from, to } = this.getPeriodDates(period, user?.timezone ?? 'UTC');

    const [incomes, rates] = await Promise.all([
      this.prisma.income.findMany({
        where: { userId, ...(categoryId ? { categoryId } : {}), date: { gte: from, lte: to } },
        select: {
          amount: true,
          amountUsd: true,
          currency: true,
          description: true,
          date: true,
          category: { select: { name: true } },
        },
        // Внутри одного дня (date без времени) сохраняем порядок добавления по createdAt.
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.currency.getRates(),
    ]);

    // По категории храним исходные строки (для пересчёта итога) и позиции (для вывода).
    const map = new Map<
      string,
      {
        rows: { currency: string; amount: number; amountUsd: number | null }[];
        items: { date: Date; amount: number; currency: string; description?: string }[];
      }
    >();
    const allRows: { currency: string; amount: number; amountUsd: number | null }[] = [];
    for (const e of incomes) {
      const name = e.category?.name ?? '—';
      let group = map.get(name);
      if (!group) {
        group = { rows: [], items: [] };
        map.set(name, group);
      }
      const amount = Number(e.amount);
      const row = {
        currency: e.currency,
        amount,
        amountUsd: e.amountUsd != null ? Number(e.amountUsd) : null,
      };
      group.rows.push(row);
      allRows.push(row);
      // Позицию показываем в ИСХОДНОЙ валюте операции.
      group.items.push({ date: e.date, amount, currency: e.currency, description: e.description });
    }

    const categories = [...map.entries()].map(([category, group]) => ({
      category,
      // Итог по категории — пересчёт в базовую валюту одной операцией (как в ЛК).
      total: this.currency.approxTotalInBase(group.rows, baseCurrency, rates, 'income'),
      items: group.items,
    }));

    return {
      baseCurrency,
      total: this.currency.approxTotalInBase(allRows, baseCurrency, rates, 'income'),
      categories,
    };
  }

  // Границы периода в «настенном» времени пользователя (UTC-компоненты совпадают с тем,
  // как хранится поле date), иначе сегодняшние записи с локальным временем «впереди» UTC
  // отсекаются по границе to.
  private getPeriodDates(period: string, timezone: string): { from: Date; to: Date } {
    const now = localWallClockNow(timezone);
    if (period === 'day') {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      return { from, to: now };
    }
    if (period === 'week') {
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 7);
      return { from, to: now };
    }
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from, to: now };
  }
}
