import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { localWallClockNow } from '../../common/timezone.util';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { UsersService } from '../../modules/users/users.service';
import { resolveLocale, t } from '../i18n';
import { StateService } from '../state.service';
import { withEmoji } from './category.util';
import { mainMenu } from './start.handler';

@Injectable()
export class ExpenseHandler {
  constructor(
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly expensesService: ExpensesService,
    private readonly usersService: UsersService,
    private readonly stateService: StateService,
  ) {}

  async handleAdd(ctx: Context, userId: string) {
    const locale = resolveLocale(ctx.from?.language_code);
    const m = t(locale);
    const categories = await this.categoriesService.findAllByUser(userId);
    if (!categories.length) {
      await ctx.reply(m.addAtLeastOneExpenseCategory, { reply_markup: mainMenu(locale) });
      return;
    }
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, i) => {
      keyboard.text(withEmoji(cat.name, cat.emoji), `/addexpense:${cat.id}`);
      if (i % 2 === 1) keyboard.row();
    });
    await ctx.reply(m.chooseCategory, { reply_markup: keyboard });
  }

  async handleCategorySelected(ctx: Context, userId: string, categoryId: string) {
    const m = t(resolveLocale(ctx.from?.language_code));
    const category = await this.categoriesService.findOne(categoryId, userId);
    const categoryLabel = withEmoji(category.name, category.emoji);
    await this.stateService.set(userId, {
      step: 'addexpense:waiting_amount',
      categoryId,
      categoryName: categoryLabel,
    });
    await ctx.reply(m.categoryAmountPrompt(categoryLabel));
  }

  async handleAmountInput(ctx: Context, userId: string, text: string) {
    const m = t(resolveLocale(ctx.from?.language_code));
    const amount = parseFloat(text.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      await ctx.reply(m.enterValidExpenseAmount);
      return;
    }
    await this.stateService.set(userId, {
      step: 'addexpense:waiting_description',
      amount,
    });
    await ctx.reply(m.enterDescription);
  }

  async handleDescriptionInput(ctx: Context, userId: string, text: string) {
    const locale = resolveLocale(ctx.from?.language_code);
    const m = t(locale);
    const state = await this.stateService.get(userId);
    if (!state?.categoryId || !state?.amount) {
      await this.stateService.reset(userId);
      await ctx.reply(m.somethingWrong, { reply_markup: mainMenu(locale) });
      return;
    }

    const timezone = await this.usersService.getTimezone(userId);
    await this.expensesService.create(userId, {
      categoryId: state.categoryId,
      amount: Number(state.amount),
      description: text,
      date: localWallClockNow(timezone),
    });

    await this.stateService.reset(userId);
    await ctx.reply(m.expenseAdded(state.categoryName, Number(state.amount), text), {
      reply_markup: mainMenu(locale),
    });
  }
}
