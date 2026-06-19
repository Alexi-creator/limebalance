import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { resolveLocale, t } from '../i18n';
import { StateService } from '../state.service';
import { mainMenu } from './start.handler';

@Injectable()
export class CategoryHandler {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly incomeCategoriesService: IncomeCategoriesService,
    private readonly stateService: StateService,
  ) {}

  async handleAdd(ctx: Context) {
    const m = t(resolveLocale(ctx.from?.language_code));
    const keyboard = new InlineKeyboard()
      .text(m.typeExpense, '/addcategory:expense')
      .text(m.typeIncome, '/addcategory:income');
    await ctx.reply(m.categoryTypePrompt, { reply_markup: keyboard });
  }

  async handleTypeSelected(ctx: Context, userId: string, type: 'expense' | 'income') {
    const m = t(resolveLocale(ctx.from?.language_code));
    const step =
      type === 'expense' ? 'addcategory:expense:waiting_name' : 'addcategory:income:waiting_name';
    await this.stateService.set(userId, { step });
    await ctx.reply(m.enterCategoryName);
  }

  async handleNameInput(ctx: Context, userId: string, text: string, step: string) {
    const locale = resolveLocale(ctx.from?.language_code);
    if (step === 'addcategory:expense:waiting_name') {
      await this.expenseCategoriesService.create(userId, { name: text });
    } else {
      await this.incomeCategoriesService.create(userId, { name: text });
    }
    await this.stateService.reset(userId);
    await ctx.reply(t(locale).categoryCreated, { reply_markup: mainMenu(locale) });
  }

  async handleViewAll(ctx: Context, userId: string) {
    const locale = resolveLocale(ctx.from?.language_code);
    const m = t(locale);
    const [expenseCategories, incomeCategories] = await Promise.all([
      this.expenseCategoriesService.findAllByUser(userId),
      this.incomeCategoriesService.findAllByUser(userId),
    ]);

    if (!expenseCategories.length && !incomeCategories.length) {
      await ctx.reply(m.noCategories, { reply_markup: mainMenu(locale) });
      return;
    }

    let text = '';
    if (expenseCategories.length) {
      text += `${m.listExpensesHeading}\n${expenseCategories.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`;
    }
    if (incomeCategories.length) {
      if (text) text += '\n\n';
      text += `${m.listIncomesHeading}\n${incomeCategories.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`;
    }

    await ctx.reply(text, { reply_markup: mainMenu(locale) });
  }
}
