// Bot localisation, powered by i18next with one JSON bundle per language
// (see ./languages.ts and ./locales). The interface language is chosen from the
// Telegram user's `language_code` (see resolveLocale).
//
// Handlers don't call i18next directly: `t(locale)` returns a typed `Messages`
// facade so call sites stay terse and type-checked, while translations live in
// the JSON files.

import i18next from 'i18next';
import { Locale, languages, SUPPORTED_LOCALES } from './languages';

export type { Locale };
export { languages, SUPPORTED_LOCALES };

// Fallback when a code is unrecognised (e.g. "de" with no bundle would never
// happen here, but "xx" → en). An empty/absent code keeps the historical
// Russian default.
const FALLBACK_LOCALE: Locale = 'en';
const DEFAULT_LOCALE: Locale = 'ru';

void i18next.init({
  resources: Object.fromEntries(
    Object.entries(languages).map(([code, { translation }]) => [code, { translation }]),
  ),
  lng: DEFAULT_LOCALE,
  fallbackLng: FALLBACK_LOCALE,
  interpolation: { escapeValue: false },
});

// Maps a Telegram `language_code` (e.g. "ru", "en-US", "pt-BR") to a supported
// locale. Missing code → Russian default; unknown language → English.
export function resolveLocale(code?: string | null): Locale {
  if (!code) return DEFAULT_LOCALE;
  const base = code.toLowerCase().split('-')[0];
  return (SUPPORTED_LOCALES as string[]).includes(base) ? (base as Locale) : FALLBACK_LOCALE;
}

type TxType = 'expense' | 'income';

// Typed view over a locale's strings. Static fields are plain strings; anything
// that interpolates a value is a function.
export interface Messages {
  welcomeNew: string;
  welcomeBack: string;

  menuViewCategories: string;
  menuAddCategory: string;
  menuAddIncome: string;
  menuAddExpense: string;
  menuStat: string;

  pressStartFirst: string;
  chooseFromMenu: string;
  somethingWrong: string;
  limitReached: string;

  categoryTypePrompt: string;
  typeExpense: string;
  typeIncome: string;
  enterCategoryName: string;
  categoryCreated: string;
  noCategories: string;
  listExpensesHeading: string;
  listIncomesHeading: string;

  addAtLeastOneExpenseCategory: string;
  addAtLeastOneIncomeCategory: string;
  chooseCategory: string;
  categoryAmountPrompt: (name: string) => string;
  enterValidExpenseAmount: string;
  enterValidIncomeAmount: string;
  enterDescription: string;
  expenseAdded: (name: string | null | undefined, amount: number, description: string) => string;
  incomeAdded: (name: string | null | undefined, amount: number, description: string) => string;

  whatToView: string;
  addAtLeastOneCategoryOfType: (type: TxType) => string;
  btnAll: string;
  btnMonth: string;
  btnWeek: string;
  btnDay: string;
  choosePeriod: string;
  btnWithDetails: string;
  btnWithoutDetails: string;
  needDetails: string;
  rateUnavailable: string;
  nothingForPeriod: (type: TxType) => string;
  statHeading: (type: TxType) => string;
  withDetailsHeading: (type: TxType) => string;
  total: string;
  dateLocale: string;

  // Trade-closed push (investing diary — exchange-synced trades only).
  tradeSideLong: string;
  tradeSideShort: string;
  tradeClosedHeading: (emoji: string, symbol: string, side: string) => string;
  tradePnl: (pnl: string) => string;
  tradeRoi: (roi: string) => string;
  tradeDuration: (duration: string) => string;
  tradeEntryExit: (entry: string, exit: string) => string;

  // Monthly digest push, sent on the 1st for the previous calendar month.
  digestHeading: (period: string) => string;
  digestIncome: string;
  digestExpense: string;
  digestNet: string;
  digestSavingsRate: string;
  digestVsPrevMonth: string;
  digestTopCategory: string;
  digestBiggestExpense: string;
  digestGoalsContributed: string;
  digestGoalsCompleted: string;
  digestInvestingPnl: string;
}

// Builds the typed facade for a locale, backed by i18next's fixed translator.
export function t(locale: Locale): Messages {
  const tt = i18next.getFixedT(locale);
  return {
    welcomeNew: tt('start.welcomeNew'),
    welcomeBack: tt('start.welcomeBack'),

    menuViewCategories: tt('menu.viewCategories'),
    menuAddCategory: tt('menu.addCategory'),
    menuAddIncome: tt('menu.addIncome'),
    menuAddExpense: tt('menu.addExpense'),
    menuStat: tt('menu.stat'),

    pressStartFirst: tt('common.pressStartFirst'),
    chooseFromMenu: tt('common.chooseFromMenu'),
    somethingWrong: tt('common.somethingWrong'),
    limitReached: tt('common.limitReached'),

    categoryTypePrompt: tt('category.typePrompt'),
    typeExpense: tt('category.typeExpense'),
    typeIncome: tt('category.typeIncome'),
    enterCategoryName: tt('category.enterName'),
    categoryCreated: tt('category.created'),
    noCategories: tt('category.none'),
    listExpensesHeading: tt('category.listExpensesHeading'),
    listIncomesHeading: tt('category.listIncomesHeading'),

    addAtLeastOneExpenseCategory: tt('flow.addAtLeastOneExpenseCategory'),
    addAtLeastOneIncomeCategory: tt('flow.addAtLeastOneIncomeCategory'),
    chooseCategory: tt('flow.chooseCategory'),
    categoryAmountPrompt: (name) => tt('flow.categoryAmountPrompt', { name }),
    enterValidExpenseAmount: tt('flow.enterValidExpenseAmount'),
    enterValidIncomeAmount: tt('flow.enterValidIncomeAmount'),
    enterDescription: tt('flow.enterDescription'),
    expenseAdded: (name, amount, description) =>
      tt('flow.expenseAdded', { name, amount, description }),
    incomeAdded: (name, amount, description) =>
      tt('flow.incomeAdded', { name, amount, description }),

    whatToView: tt('stat.whatToView'),
    addAtLeastOneCategoryOfType: (type) => tt(`stat.addCategoryFirst.${type}`),
    btnAll: tt('stat.all'),
    btnMonth: tt('stat.month'),
    btnWeek: tt('stat.week'),
    btnDay: tt('stat.day'),
    choosePeriod: tt('stat.choosePeriod'),
    btnWithDetails: tt('stat.withDetails'),
    btnWithoutDetails: tt('stat.withoutDetails'),
    needDetails: tt('stat.needDetails'),
    rateUnavailable: tt('stat.rateUnavailable'),
    nothingForPeriod: (type) => tt(`stat.nothingForPeriod.${type}`),
    statHeading: (type) => tt(`stat.heading.${type}`),
    withDetailsHeading: (type) => `${tt(`stat.withDetailsHeading.${type}`)}\n\n`,
    total: tt('stat.total'),
    dateLocale: locale,

    tradeSideLong: tt('push.trade.long'),
    tradeSideShort: tt('push.trade.short'),
    tradeClosedHeading: (emoji, symbol, side) => tt('push.trade.heading', { emoji, symbol, side }),
    tradePnl: (pnl) => tt('push.trade.pnl', { pnl }),
    tradeRoi: (roi) => tt('push.trade.roi', { roi }),
    tradeDuration: (duration) => tt('push.trade.duration', { duration }),
    tradeEntryExit: (entry, exit) => tt('push.trade.entryExit', { entry, exit }),

    digestHeading: (period) => tt('push.digest.heading', { period }),
    digestIncome: tt('push.digest.income'),
    digestExpense: tt('push.digest.expense'),
    digestNet: tt('push.digest.net'),
    digestSavingsRate: tt('push.digest.savingsRate'),
    digestVsPrevMonth: tt('push.digest.vsPrevMonth'),
    digestTopCategory: tt('push.digest.topCategory'),
    digestBiggestExpense: tt('push.digest.biggestExpense'),
    digestGoalsContributed: tt('push.digest.goalsContributed'),
    digestGoalsCompleted: tt('push.digest.goalsCompleted'),
    digestInvestingPnl: tt('push.digest.investingPnl'),
  };
}

export type MenuAction = 'viewCategories' | 'addCategory' | 'addIncome' | 'addExpense' | 'stat';

const MENU_KEYS: Record<MenuAction, string> = {
  viewCategories: 'menu.viewCategories',
  addCategory: 'menu.addCategory',
  addIncome: 'menu.addIncome',
  addExpense: 'menu.addExpense',
  stat: 'menu.stat',
};

// Precomputed reverse lookup: rendered button text → action, across every
// supported locale (a user may switch Telegram language between rendering the
// keyboard and tapping it).
const menuLookup = new Map<string, MenuAction>();
for (const locale of SUPPORTED_LOCALES) {
  const tt = i18next.getFixedT(locale);
  for (const [action, key] of Object.entries(MENU_KEYS) as [MenuAction, string][]) {
    menuLookup.set(tt(key), action);
  }
}

export function matchMenuAction(text: string): MenuAction | null {
  return menuLookup.get(text) ?? null;
}
