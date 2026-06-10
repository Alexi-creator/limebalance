import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { StateService } from '../state.service';
import { MAIN_MENU } from './start.handler';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  THB: '฿',
  GBP: '£',
  JPY: '¥',
};

const symbol = (code: string) => CURRENCY_SYMBOLS[code] ?? code;

// Точная сумма в её исходной валюте.
const exact = (value: number, currency: string) => `${value.toFixed(2)} ${symbol(currency)}`;

// Прибл. сумма в базовой валюте пользователя. null → курсы недоступны.
const money = (value: number | null, currency: string) =>
  value === null ? 'курс недоступен' : `≈ ${exact(value, currency)}`;

// Telegram ограничивает сообщение 4096 символами. Длинный ответ (детализация с сотнями
// позиций) режем на части по границам строк; клавиатуру вешаем только на последнюю часть.
const TG_TEXT_LIMIT = 4000; // запас от 4096
async function replyLong(ctx: Context, text: string, replyMarkup: typeof MAIN_MENU) {
  const chunks: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (line.length > TG_TEXT_LIMIT) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      for (let i = 0; i < line.length; i += TG_TEXT_LIMIT) chunks.push(line.slice(i, i + TG_TEXT_LIMIT));
      continue;
    }
    if (cur.length + line.length + 1 > TG_TEXT_LIMIT) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) chunks.push(cur);

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await ctx.reply(chunks[i], isLast ? { reply_markup: replyMarkup } : {});
  }
}

@Injectable()
export class StatHandler {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly incomeCategoriesService: IncomeCategoriesService,
    private readonly expensesService: ExpensesService,
    private readonly incomesService: IncomesService,
    private readonly stateService: StateService,
  ) {}

  async handleStat(ctx: Context) {
    const keyboard = new InlineKeyboard()
      .text('Расходы', '/stattype:expense')
      .text('Доходы', '/stattype:income');
    await ctx.reply('Что смотрим?', { reply_markup: keyboard });
  }

  async handleTypeSelected(ctx: Context, userId: string, type: 'expense' | 'income') {
    const categories =
      type === 'expense'
        ? await this.expenseCategoriesService.findAllByUser(userId)
        : await this.incomeCategoriesService.findAllByUser(userId);

    if (!categories.length) {
      const label = type === 'expense' ? 'расходов' : 'доходов';
      await ctx.reply(`Для начала добавьте хотя бы одну категорию ${label}.`, {
        reply_markup: MAIN_MENU,
      });
      return;
    }

    const prefix = type === 'expense' ? '/statexpense:' : '/statincome:';
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, i) => {
      keyboard.text(cat.name, `${prefix}${cat.id}`);
      if (i % 2 === 1) keyboard.row();
    });
    if (categories.length % 2 === 0) keyboard.row();
    keyboard.text('Все', `${prefix}all`);

    await ctx.reply('Выберите категорию:', { reply_markup: keyboard });
  }

  async handleCategorySelected(
    ctx: Context,
    userId: string,
    rawId: string,
    type: 'expense' | 'income',
  ) {
    await this.stateService.reset(userId);
    await this.stateService.set(userId, {
      step:
        type === 'expense' ? 'stat:expense:waiting_for_period' : 'stat:income:waiting_for_period',
      ...(rawId !== 'all' ? { categoryId: rawId } : {}),
    });

    const keyboard = new InlineKeyboard()
      .text('Текущий месяц', '/period:month')
      .text('Неделя', '/period:week')
      .text('Сегодня', '/period:day');

    await ctx.reply('Выберите период:', { reply_markup: keyboard });
  }

  async handlePeriodSelected(ctx: Context, userId: string, period: string) {
    const state = await this.stateService.get(userId);
    const type = state?.step?.includes(':income:') ? 'income' : 'expense';

    await this.stateService.set(userId, {
      step:
        type === 'expense' ? 'stat:expense:waiting_for_details' : 'stat:income:waiting_for_details',
      period,
    });

    const keyboard = new InlineKeyboard()
      .text('С детализацией', '/details:yes')
      .text('Без детализации', '/details:no');

    await ctx.reply('Нужна детализация?', { reply_markup: keyboard });
  }

  async handleDetailsSelected(ctx: Context, userId: string, isDetails: boolean) {
    const state = await this.stateService.get(userId);
    if (!state?.period) {
      await this.stateService.reset(userId);
      await ctx.reply('Что-то пошло не так. Начните заново.', { reply_markup: MAIN_MENU });
      return;
    }

    const type = state.step?.includes(':income:') ? 'income' : 'expense';
    const categoryId = state.categoryId ?? null;
    const { period } = state;
    await this.stateService.reset(userId);

    const label = type === 'expense' ? 'Траты' : 'Доходы';
    const labelEmpty = type === 'expense' ? 'трат' : 'доходов';

    if (isDetails) {
      const { baseCurrency, total, categories } =
        type === 'expense'
          ? await this.expensesService.statDetails(userId, categoryId, period)
          : await this.incomesService.statDetails(userId, categoryId, period);

      if (!categories.length) {
        await ctx.reply(`За выбранный период ${labelEmpty} нет 🙂`, { reply_markup: MAIN_MENU });
        return;
      }

      let text = `${label} с детализацией:\n\n`;
      for (const cat of categories) {
        text += `📌 ${cat.category} — ${money(cat.total, baseCurrency)}\n`;
        for (const item of cat.items) {
          const date = item.date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
          // Позиция — в её исходной валюте.
          text += `  • ${date}: ${exact(item.amount, item.currency)}`;
          if (item.description) text += ` — ${item.description}`;
          text += '\n';
        }
        text += '\n';
      }
      if (categories.length > 1) text += `Итого: ${money(total, baseCurrency)}`;

      await replyLong(ctx, text, MAIN_MENU);
    } else {
      const { baseCurrency, total, items } =
        type === 'expense'
          ? await this.expensesService.statSummary(userId, categoryId, period)
          : await this.incomesService.statSummary(userId, categoryId, period);

      if (!items.length) {
        await ctx.reply(`За выбранный период ${labelEmpty} нет 🙂`, { reply_markup: MAIN_MENU });
        return;
      }

      let text = `${label}:\n\n`;
      for (const row of items) {
        text += `• ${row.category} — ${money(row.total, baseCurrency)}\n`;
      }
      if (items.length > 1) text += `\nИтого: ${money(total, baseCurrency)}`;

      await replyLong(ctx, text, MAIN_MENU);
    }
  }
}
