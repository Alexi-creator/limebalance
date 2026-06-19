import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { Locale, Messages, resolveLocale, t } from '../i18n';
import { StateService } from '../state.service';
import { mainMenu } from './start.handler';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  THB: '฿',
  GBP: '£',
  JPY: '¥',
};

const symbol = (code: string) => CURRENCY_SYMBOLS[code] ?? code;

// Prefix a category label with its emoji (set via the web cabinet), when present.
const withEmoji = (name: string, emoji?: string | null) => (emoji ? `${emoji} ${name}` : name);

// Exact amount in its original currency.
const exact = (value: number, currency: string) => `${value.toFixed(2)} ${symbol(currency)}`;

// Approx. amount in the user's base currency. null → rates unavailable.
const money = (value: number | null, currency: string, m: Messages) =>
  value === null ? m.rateUnavailable : `≈ ${exact(value, currency)}`;

// Telegram caps a message at 4096 characters. A long reply (a breakdown with hundreds
// of items) is split into parts on line boundaries; the keyboard is attached only to the last part.
const TG_TEXT_LIMIT = 4000; // headroom below 4096
async function replyLong(ctx: Context, text: string, replyMarkup: ReturnType<typeof mainMenu>) {
  const chunks: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if (line.length > TG_TEXT_LIMIT) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      for (let i = 0; i < line.length; i += TG_TEXT_LIMIT)
        chunks.push(line.slice(i, i + TG_TEXT_LIMIT));
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

  private locale(ctx: Context): Locale {
    return resolveLocale(ctx.from?.language_code);
  }

  async handleStat(ctx: Context) {
    const m = t(this.locale(ctx));
    const keyboard = new InlineKeyboard()
      .text(m.typeExpense, '/stattype:expense')
      .text(m.typeIncome, '/stattype:income');
    await ctx.reply(m.whatToView, { reply_markup: keyboard });
  }

  async handleTypeSelected(ctx: Context, userId: string, type: 'expense' | 'income') {
    const locale = this.locale(ctx);
    const m = t(locale);
    const categories =
      type === 'expense'
        ? await this.expenseCategoriesService.findAllByUser(userId)
        : await this.incomeCategoriesService.findAllByUser(userId);

    if (!categories.length) {
      await ctx.reply(m.addAtLeastOneCategoryOfType(type), {
        reply_markup: mainMenu(locale),
      });
      return;
    }

    const prefix = type === 'expense' ? '/statexpense:' : '/statincome:';
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, i) => {
      keyboard.text(withEmoji(cat.name, cat.emoji), `${prefix}${cat.id}`);
      if (i % 2 === 1) keyboard.row();
    });
    if (categories.length % 2 === 0) keyboard.row();
    keyboard.text(m.btnAll, `${prefix}all`);

    await ctx.reply(m.chooseCategory, { reply_markup: keyboard });
  }

  async handleCategorySelected(
    ctx: Context,
    userId: string,
    rawId: string,
    type: 'expense' | 'income',
  ) {
    const m = t(this.locale(ctx));
    await this.stateService.reset(userId);
    await this.stateService.set(userId, {
      step:
        type === 'expense' ? 'stat:expense:waiting_for_period' : 'stat:income:waiting_for_period',
      ...(rawId !== 'all' ? { categoryId: rawId } : {}),
    });

    const keyboard = new InlineKeyboard()
      .text(m.btnMonth, '/period:month')
      .text(m.btnWeek, '/period:week')
      .text(m.btnDay, '/period:day');

    await ctx.reply(m.choosePeriod, { reply_markup: keyboard });
  }

  async handlePeriodSelected(ctx: Context, userId: string, period: string) {
    const m = t(this.locale(ctx));
    const state = await this.stateService.get(userId);
    const type = state?.step?.includes(':income:') ? 'income' : 'expense';

    await this.stateService.set(userId, {
      step:
        type === 'expense' ? 'stat:expense:waiting_for_details' : 'stat:income:waiting_for_details',
      period,
    });

    const keyboard = new InlineKeyboard()
      .text(m.btnWithDetails, '/details:yes')
      .text(m.btnWithoutDetails, '/details:no');

    await ctx.reply(m.needDetails, { reply_markup: keyboard });
  }

  async handleDetailsSelected(ctx: Context, userId: string, isDetails: boolean) {
    const locale = this.locale(ctx);
    const m = t(locale);
    const state = await this.stateService.get(userId);
    if (!state?.period) {
      await this.stateService.reset(userId);
      await ctx.reply(m.somethingWrong, { reply_markup: mainMenu(locale) });
      return;
    }

    const type = state.step?.includes(':income:') ? 'income' : 'expense';
    const categoryId = state.categoryId ?? null;
    const { period } = state;
    await this.stateService.reset(userId);

    if (isDetails) {
      const { baseCurrency, total, categories } =
        type === 'expense'
          ? await this.expensesService.statDetails(userId, categoryId, period)
          : await this.incomesService.statDetails(userId, categoryId, period);

      if (!categories.length) {
        await ctx.reply(m.nothingForPeriod(type), { reply_markup: mainMenu(locale) });
        return;
      }

      let text = m.withDetailsHeading(type);
      for (const cat of categories) {
        text += `${withEmoji(cat.category, cat.emoji ?? '📌')} — ${money(cat.total, baseCurrency, m)}\n`;
        for (const item of cat.items) {
          const date = item.date.toLocaleDateString(m.dateLocale, {
            day: '2-digit',
            month: '2-digit',
          });
          // Item — in its original currency.
          text += `  • ${date}: ${exact(item.amount, item.currency)}`;
          if (item.description) text += ` — ${item.description}`;
          text += '\n';
        }
        text += '\n';
      }
      if (categories.length > 1) text += `${m.total}: ${money(total, baseCurrency, m)}`;

      await replyLong(ctx, text, mainMenu(locale));
    } else {
      const { baseCurrency, total, items } =
        type === 'expense'
          ? await this.expensesService.statSummary(userId, categoryId, period)
          : await this.incomesService.statSummary(userId, categoryId, period);

      if (!items.length) {
        await ctx.reply(m.nothingForPeriod(type), { reply_markup: mainMenu(locale) });
        return;
      }

      let text = `${m.statHeading(type)}:\n\n`;
      for (const row of items) {
        text += `• ${withEmoji(row.category, row.emoji)} — ${money(row.total, baseCurrency, m)}\n`;
      }
      if (items.length > 1) text += `\n${m.total}: ${money(total, baseCurrency, m)}`;

      await replyLong(ctx, text, mainMenu(locale));
    }
  }
}
