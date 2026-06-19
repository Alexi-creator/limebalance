import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { localWallClockNow } from '../../common/timezone.util';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { UsersService } from '../../modules/users/users.service';
import { resolveLocale, t } from '../i18n';
import { StateService } from '../state.service';
import { mainMenu } from './start.handler';

@Injectable()
export class IncomeHandler {
  constructor(
    private readonly incomeCategoriesService: IncomeCategoriesService,
    private readonly incomesService: IncomesService,
    private readonly usersService: UsersService,
    private readonly stateService: StateService,
  ) {}

  async handleAdd(ctx: Context, userId: string) {
    const locale = resolveLocale(ctx.from?.language_code);
    const m = t(locale);
    const categories = await this.incomeCategoriesService.findAllByUser(userId);
    if (!categories.length) {
      await ctx.reply(m.addAtLeastOneIncomeCategory, {
        reply_markup: mainMenu(locale),
      });
      return;
    }
    const keyboard = new InlineKeyboard();
    categories.forEach((cat, i) => {
      keyboard.text(cat.name, `/addincome:${cat.id}`);
      if (i % 2 === 1) keyboard.row();
    });
    await ctx.reply(m.chooseCategory, { reply_markup: keyboard });
  }

  async handleCategorySelected(ctx: Context, userId: string, categoryId: string) {
    const m = t(resolveLocale(ctx.from?.language_code));
    const category = await this.incomeCategoriesService.findOne(categoryId, userId);
    await this.stateService.set(userId, {
      step: 'addincome:waiting_amount',
      categoryId,
      categoryName: category.name,
    });
    await ctx.reply(m.categoryAmountPrompt(category.name));
  }

  async handleAmountInput(ctx: Context, userId: string, text: string) {
    const m = t(resolveLocale(ctx.from?.language_code));
    const amount = parseFloat(text.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      await ctx.reply(m.enterValidIncomeAmount);
      return;
    }
    await this.stateService.set(userId, {
      step: 'addincome:waiting_description',
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
    await this.incomesService.create(userId, {
      categoryId: state.categoryId,
      amount: Number(state.amount),
      description: text,
      date: localWallClockNow(timezone),
    });

    await this.stateService.reset(userId);
    await ctx.reply(m.incomeAdded(state.categoryName, Number(state.amount), text), {
      reply_markup: mainMenu(locale),
    });
  }
}
