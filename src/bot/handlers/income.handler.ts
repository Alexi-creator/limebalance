import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { localWallClockNow } from '../../common/timezone.util';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { UsersService } from '../../modules/users/users.service';
import { StateService } from '../state.service';
import { MAIN_MENU } from './start.handler';

@Injectable()
export class IncomeHandler {
  constructor(
    private readonly incomeCategoriesService: IncomeCategoriesService,
    private readonly incomesService: IncomesService,
    private readonly usersService: UsersService,
    private readonly stateService: StateService,
  ) {}

  async handleAdd(ctx: Context, userId: string) {
    const categories = await this.incomeCategoriesService.findAllByUser(userId);
    if (!categories.length) {
      await ctx.reply('Для начала добавьте хотя бы одну категорию доходов.', {
        reply_markup: MAIN_MENU,
      });
      return;
    }
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, i) => {
      keyboard.text(cat.name, `/addincome:${cat.id}`);
      if (i % 2 === 1) keyboard.row();
    });
    await ctx.reply('Выберите категорию:', { reply_markup: keyboard });
  }

  async handleCategorySelected(ctx: Context, userId: string, categoryId: string) {
    const category = await this.incomeCategoriesService.findOne(categoryId, userId);
    await this.stateService.set(userId, {
      step: 'addincome:waiting_amount',
      categoryId,
      categoryName: category.name,
    });
    await ctx.reply(`Категория: ${category.name}\n\nВведите сумму:`);
  }

  async handleAmountInput(ctx: Context, userId: string, text: string) {
    const amount = parseFloat(text.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      await ctx.reply('Введите корректную сумму (например: 50000 или 1500.50):');
      return;
    }
    await this.stateService.set(userId, {
      step: 'addincome:waiting_description',
      amount,
    });
    await ctx.reply('Введите описание:');
  }

  async handleDescriptionInput(ctx: Context, userId: string, text: string) {
    const state = await this.stateService.get(userId);
    if (!state?.categoryId || !state?.amount) {
      await this.stateService.reset(userId);
      await ctx.reply('Что-то пошло не так. Начните заново.', { reply_markup: MAIN_MENU });
      return;
    }

    const timezone = await this.usersService.getTimezone(userId);
    await this.incomesService.create(userId, {
      categoryId: state.categoryId,
      amount: Number(state.amount),
      description: text,
      date: localWallClockNow(timezone),
    });

    await this.stateService.reset(userId);
    await ctx.reply(
      `✅ Доход добавлен!\n\nКатегория: ${state.categoryName}\nСумма: ${Number(state.amount)}\nОписание: ${text}`,
      { reply_markup: MAIN_MENU },
    );
  }
}
