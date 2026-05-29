import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { UsersService } from '../modules/users/users.service';
import { CategoryHandler } from './handlers/category.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { MAIN_MENU, StartHandler } from './handlers/start.handler';
import { StatHandler } from './handlers/stat.handler';
import { StateService } from './state.service';

@Injectable()
export class BotService implements OnModuleInit {
  readonly bot: Bot;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly stateService: StateService,
    private readonly startHandler: StartHandler,
    private readonly categoryHandler: CategoryHandler,
    private readonly expenseHandler: ExpenseHandler,
    private readonly incomeHandler: IncomeHandler,
    private readonly statHandler: StatHandler,
  ) {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) throw new Error('BOT_TOKEN is not defined');
    this.bot = new Bot(token);
  }

  async onModuleInit() {
    await this.bot.init();
    this.registerHandlers();
  }

  handleUpdate(update: object) {
    return this.bot.handleUpdate(update as Parameters<Bot['handleUpdate']>[0]);
  }

  private registerHandlers() {
    this.bot.command('start', (ctx) => this.startHandler.handle(ctx));

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const telegramId = BigInt(ctx.from.id);
      const { user } = await this.usersService.findOrCreateByTelegramId(telegramId);

      if (data === '/addcategory:expense') {
        await this.categoryHandler.handleTypeSelected(ctx, user.id, 'expense');
      } else if (data === '/addcategory:income') {
        await this.categoryHandler.handleTypeSelected(ctx, user.id, 'income');
      } else if (data.startsWith('/addincome:')) {
        await this.incomeHandler.handleCategorySelected(
          ctx,
          user.id,
          data.slice('/addincome:'.length),
        );
      } else if (data.startsWith('/addexpense:')) {
        await this.expenseHandler.handleCategorySelected(
          ctx,
          user.id,
          data.slice('/addexpense:'.length),
        );
      } else if (data.startsWith('/stattype:')) {
        const type = data.slice('/stattype:'.length) as 'expense' | 'income';
        await this.statHandler.handleTypeSelected(ctx, user.id, type);
      } else if (data.startsWith('/statexpense:')) {
        await this.statHandler.handleCategorySelected(
          ctx,
          user.id,
          data.slice('/statexpense:'.length),
          'expense',
        );
      } else if (data.startsWith('/statincome:')) {
        await this.statHandler.handleCategorySelected(
          ctx,
          user.id,
          data.slice('/statincome:'.length),
          'income',
        );
      } else if (data.startsWith('/period:')) {
        await this.statHandler.handlePeriodSelected(ctx, user.id, data.slice('/period:'.length));
      } else if (data.startsWith('/details:')) {
        await this.statHandler.handleDetailsSelected(
          ctx,
          user.id,
          data.slice('/details:'.length) === 'yes',
        );
      }

      await ctx.answerCallbackQuery();
    });

    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;
      const telegramId = BigInt(ctx.from.id);

      const existing = await this.usersService.findByTelegramId(telegramId);

      if (!existing) {
        await ctx.reply('Для начала нажмите /start');
        return;
      }

      const userId = existing.id;
      const step = await this.stateService.getStep(userId);

      // роутинг по тексту кнопок меню
      if (text === 'Добавить категорию') return this.categoryHandler.handleAdd(ctx);
      if (text === 'Посмотреть все категории')
        return this.categoryHandler.handleViewAll(ctx, userId);
      if (text === 'Добавить трату') return this.expenseHandler.handleAdd(ctx, userId);
      if (text === 'Добавить доход') return this.incomeHandler.handleAdd(ctx, userId);
      if (text === 'Статистика') return this.statHandler.handleStat(ctx);

      // роутинг по текущему шагу FSM
      if (
        step === 'addcategory:expense:waiting_name' ||
        step === 'addcategory:income:waiting_name'
      ) {
        return this.categoryHandler.handleNameInput(ctx, userId, text, step);
      }
      if (step === 'addexpense:waiting_amount') {
        return this.expenseHandler.handleAmountInput(ctx, userId, text);
      }
      if (step === 'addexpense:waiting_description') {
        return this.expenseHandler.handleDescriptionInput(ctx, userId, text);
      }
      if (step === 'addincome:waiting_amount') {
        return this.incomeHandler.handleAmountInput(ctx, userId, text);
      }
      if (step === 'addincome:waiting_description') {
        return this.incomeHandler.handleDescriptionInput(ctx, userId, text);
      }

      await ctx.reply('Выберите действие из меню.', { reply_markup: MAIN_MENU });
    });
  }
}
