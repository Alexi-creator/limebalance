import { Injectable } from '@nestjs/common';
import { Context, Keyboard } from 'grammy';
import { UsersService } from '../../modules/users/users.service';
import { Locale, resolveLocale, t } from '../i18n';

// Builds the main reply keyboard in the given locale.
export function mainMenu(locale: Locale) {
  const m = t(locale);
  return new Keyboard()
    .text(m.menuViewCategories)
    .text(m.menuAddCategory)
    .row()
    .text(m.menuAddIncome)
    .text(m.menuStat)
    .row()
    .text(m.menuAddExpense)
    .resized();
}

@Injectable()
export class StartHandler {
  constructor(private readonly usersService: UsersService) {}

  async handle(ctx: Context) {
    if (!ctx.from) return;
    const locale = resolveLocale(ctx.from.language_code);
    const m = t(locale);
    const telegramId = BigInt(ctx.from.id);
    const { isNew } = await this.usersService.findOrCreateByTelegramId(
      telegramId,
      undefined,
      ctx.from.username ?? null,
      ctx.from.language_code ?? null,
    );

    const text = isNew ? m.welcomeNew : m.welcomeBack;

    await ctx.reply(text, { reply_markup: mainMenu(locale) });
  }
}
