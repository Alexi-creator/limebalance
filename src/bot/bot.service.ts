import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { PlanLimitExceededException } from '../modules/subscriptions/plan-limit-exceeded.exception';
import { UsersService } from '../modules/users/users.service';
import { CategoryHandler } from './handlers/category.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { mainMenu, StartHandler } from './handlers/start.handler';
import { StatHandler } from './handlers/stat.handler';
import { matchMenuAction, resolveLocale, t } from './i18n';
import { StateService } from './state.service';

@Injectable()
export class BotService implements OnModuleInit {
  readonly bot: Bot;
  private readonly logger = new Logger(BotService.name);

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

  // Proactive send, outside any incoming update (monthly digest, trade-closed…). Swallows failures
  // (e.g. the user blocked the bot) so one bad send never breaks a batch loop over many users.
  async pushMessage(telegramId: bigint, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(telegramId.toString(), text);
    } catch (err) {
      this.logger.warn(`Failed to push message to ${telegramId}: ${err}`);
    }
  }

  private registerHandlers() {
    this.bot.command('start', (ctx) => this.startHandler.handle(ctx));

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const telegramId = BigInt(ctx.from.id);
      const { user } = await this.usersService.findOrCreateByTelegramId(
        telegramId,
        undefined,
        ctx.from.username ?? null,
        ctx.from.language_code ?? null,
      );

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
      const locale = resolveLocale(ctx.from.language_code);
      const telegramId = BigInt(ctx.from.id);

      const existing = await this.usersService.findByTelegramId(telegramId);

      if (!existing) {
        await ctx.reply(t(locale).pressStartFirst);
        return;
      }

      const userId = existing.id;
      const step = await this.stateService.getStep(userId);

      try {
        // route by menu button text (matched across all supported locales)
        switch (matchMenuAction(text)) {
          case 'addCategory':
            return await this.categoryHandler.handleAdd(ctx);
          case 'viewCategories':
            return await this.categoryHandler.handleViewAll(ctx, userId);
          case 'addExpense':
            return await this.expenseHandler.handleAdd(ctx, userId);
          case 'addIncome':
            return await this.incomeHandler.handleAdd(ctx, userId);
          case 'stat':
            return await this.statHandler.handleStat(ctx);
        }

        // route by current FSM step
        if (
          step === 'addcategory:expense:waiting_name' ||
          step === 'addcategory:income:waiting_name'
        ) {
          return await this.categoryHandler.handleNameInput(ctx, userId, text, step);
        }
        if (step === 'addexpense:waiting_amount') {
          return await this.expenseHandler.handleAmountInput(ctx, userId, text);
        }
        if (step === 'addexpense:waiting_description') {
          return await this.expenseHandler.handleDescriptionInput(ctx, userId, text);
        }
        if (step === 'addincome:waiting_amount') {
          return await this.incomeHandler.handleAmountInput(ctx, userId, text);
        }
        if (step === 'addincome:waiting_description') {
          return await this.incomeHandler.handleDescriptionInput(ctx, userId, text);
        }

        await ctx.reply(t(locale).chooseFromMenu, { reply_markup: mainMenu(locale) });
      } catch (err) {
        // Plan limit hit (free tier ran out): clear the in-progress flow and prompt to upgrade,
        // instead of letting the error bubble up and leave the user with no reply.
        if (err instanceof PlanLimitExceededException) {
          await this.stateService.reset(userId);
          await ctx.reply(t(locale).limitReached, { reply_markup: mainMenu(locale) });
          return;
        }
        throw err;
      }
    });
  }
}
