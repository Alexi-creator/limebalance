import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { StateService } from '../state.service';
import { MAIN_MENU } from './start.handler';

@Injectable()
export class CategoryHandler {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly incomeCategoriesService: IncomeCategoriesService,
    private readonly stateService: StateService,
  ) {}

  async handleAdd(ctx: Context) {
    const keyboard = new InlineKeyboard()
      .text('Расходы', '/addcategory:expense')
      .text('Доходы', '/addcategory:income');
    await ctx.reply('Для какого типа создать категорию?', { reply_markup: keyboard });
  }

  async handleTypeSelected(ctx: Context, userId: string, type: 'expense' | 'income') {
    const step =
      type === 'expense' ? 'addcategory:expense:waiting_name' : 'addcategory:income:waiting_name';
    await this.stateService.set(userId, { step });
    await ctx.reply('Введите название категории:');
  }

  async handleNameInput(ctx: Context, userId: string, text: string, step: string) {
    if (step === 'addcategory:expense:waiting_name') {
      await this.expenseCategoriesService.create(userId, { name: text });
    } else {
      await this.incomeCategoriesService.create(userId, { name: text });
    }
    await this.stateService.reset(userId);
    await ctx.reply('✅ Категория успешно создана!', { reply_markup: MAIN_MENU });
  }

  async handleViewAll(ctx: Context, userId: string) {
    const [expenseCategories, incomeCategories] = await Promise.all([
      this.expenseCategoriesService.findAllByUser(userId),
      this.incomeCategoriesService.findAllByUser(userId),
    ]);

    if (!expenseCategories.length && !incomeCategories.length) {
      await ctx.reply('У вас пока нет категорий.', { reply_markup: MAIN_MENU });
      return;
    }

    let text = '';
    if (expenseCategories.length) {
      text += `Расходы:\n${expenseCategories.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`;
    }
    if (incomeCategories.length) {
      if (text) text += '\n\n';
      text += `Доходы:\n${incomeCategories.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`;
    }

    await ctx.reply(text, { reply_markup: MAIN_MENU });
  }
}
