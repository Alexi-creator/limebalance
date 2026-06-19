// Bot localisation. The interface text is chosen from the Telegram user's
// `language_code` (see resolveLocale). Russian is the default/fallback so existing
// behaviour is unchanged for users without a recognised locale.

export type Locale = 'ru' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['ru', 'en'];

const DEFAULT_LOCALE: Locale = 'ru';

// Maps a Telegram `language_code` (e.g. "ru", "en-US") to a supported locale.
// Russian-family codes → ru, everything else → en, missing code → default.
export function resolveLocale(code?: string | null): Locale {
  if (!code) return DEFAULT_LOCALE;
  return code.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

type TxType = 'expense' | 'income';

// Shape of a single locale bundle. Plain strings for static text, functions for
// anything that interpolates values.
export interface Messages {
  // start
  welcomeNew: string;
  welcomeBack: string;

  // main menu buttons
  menuViewCategories: string;
  menuAddCategory: string;
  menuAddIncome: string;
  menuAddExpense: string;
  menuStat: string;

  // generic / routing
  pressStartFirst: string;
  chooseFromMenu: string;
  somethingWrong: string;

  // category
  categoryTypePrompt: string;
  typeExpense: string;
  typeIncome: string;
  enterCategoryName: string;
  categoryCreated: string;
  noCategories: string;
  listExpensesHeading: string;
  listIncomesHeading: string;

  // expense / income flow
  addAtLeastOneExpenseCategory: string;
  addAtLeastOneIncomeCategory: string;
  chooseCategory: string;
  categoryAmountPrompt: (name: string) => string;
  enterValidExpenseAmount: string;
  enterValidIncomeAmount: string;
  enterDescription: string;
  expenseAdded: (name: string | null | undefined, amount: number, description: string) => string;
  incomeAdded: (name: string | null | undefined, amount: number, description: string) => string;

  // stat
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
}

const ru: Messages = {
  welcomeNew: 'Добро пожаловать! Я помогу вести учёт расходов.\n\nДля начала добавьте категорию.',
  welcomeBack: 'С возвращением! Выберите действие:',

  menuViewCategories: 'Посмотреть все категории',
  menuAddCategory: 'Добавить категорию',
  menuAddIncome: 'Добавить доход',
  menuAddExpense: 'Добавить трату',
  menuStat: 'Статистика',

  pressStartFirst: 'Для начала нажмите /start',
  chooseFromMenu: 'Выберите действие из меню.',
  somethingWrong: 'Что-то пошло не так. Начните заново.',

  categoryTypePrompt: 'Для какого типа создать категорию?',
  typeExpense: 'Расходы',
  typeIncome: 'Доходы',
  enterCategoryName: 'Введите название категории:',
  categoryCreated: '✅ Категория успешно создана!',
  noCategories: 'У вас пока нет категорий.',
  listExpensesHeading: 'Расходы:',
  listIncomesHeading: 'Доходы:',

  addAtLeastOneExpenseCategory: 'Для начала добавьте хотя бы одну категорию.',
  addAtLeastOneIncomeCategory: 'Для начала добавьте хотя бы одну категорию доходов.',
  chooseCategory: 'Выберите категорию:',
  categoryAmountPrompt: (name) => `Категория: ${name}\n\nВведите сумму:`,
  enterValidExpenseAmount: 'Введите корректную сумму (например: 500 или 1500.50):',
  enterValidIncomeAmount: 'Введите корректную сумму (например: 50000 или 1500.50):',
  enterDescription: 'Введите описание:',
  expenseAdded: (name, amount, description) =>
    `✅ Трата добавлена!\n\nКатегория: ${name}\nСумма: ${amount} \nОписание: ${description}`,
  incomeAdded: (name, amount, description) =>
    `✅ Доход добавлен!\n\nКатегория: ${name}\nСумма: ${amount}\nОписание: ${description}`,

  whatToView: 'Что смотрим?',
  addAtLeastOneCategoryOfType: (type) =>
    `Для начала добавьте хотя бы одну категорию ${type === 'expense' ? 'расходов' : 'доходов'}.`,
  btnAll: 'Все',
  btnMonth: 'Текущий месяц',
  btnWeek: 'Неделя',
  btnDay: 'Сегодня',
  choosePeriod: 'Выберите период:',
  btnWithDetails: 'С детализацией',
  btnWithoutDetails: 'Без детализации',
  needDetails: 'Нужна детализация?',
  rateUnavailable: 'курс недоступен',
  nothingForPeriod: (type) =>
    `За выбранный период ${type === 'expense' ? 'трат' : 'доходов'} нет 🙂`,
  statHeading: (type) => (type === 'expense' ? 'Траты' : 'Доходы'),
  withDetailsHeading: (type) => `${type === 'expense' ? 'Траты' : 'Доходы'} с детализацией:\n\n`,
  total: 'Итого',
  dateLocale: 'ru-RU',
};

const en: Messages = {
  welcomeNew: "Welcome! I'll help you track your spending.\n\nStart by adding a category.",
  welcomeBack: 'Welcome back! Choose an action:',

  menuViewCategories: 'View all categories',
  menuAddCategory: 'Add category',
  menuAddIncome: 'Add income',
  menuAddExpense: 'Add expense',
  menuStat: 'Statistics',

  pressStartFirst: 'Please press /start first',
  chooseFromMenu: 'Choose an action from the menu.',
  somethingWrong: 'Something went wrong. Please start over.',

  categoryTypePrompt: 'What type of category do you want to create?',
  typeExpense: 'Expenses',
  typeIncome: 'Income',
  enterCategoryName: 'Enter the category name:',
  categoryCreated: '✅ Category created successfully!',
  noCategories: "You don't have any categories yet.",
  listExpensesHeading: 'Expenses:',
  listIncomesHeading: 'Income:',

  addAtLeastOneExpenseCategory: 'Add at least one category first.',
  addAtLeastOneIncomeCategory: 'Add at least one income category first.',
  chooseCategory: 'Choose a category:',
  categoryAmountPrompt: (name) => `Category: ${name}\n\nEnter the amount:`,
  enterValidExpenseAmount: 'Enter a valid amount (e.g. 500 or 1500.50):',
  enterValidIncomeAmount: 'Enter a valid amount (e.g. 50000 or 1500.50):',
  enterDescription: 'Enter a description:',
  expenseAdded: (name, amount, description) =>
    `✅ Expense added!\n\nCategory: ${name}\nAmount: ${amount} \nDescription: ${description}`,
  incomeAdded: (name, amount, description) =>
    `✅ Income added!\n\nCategory: ${name}\nAmount: ${amount}\nDescription: ${description}`,

  whatToView: 'What do you want to view?',
  addAtLeastOneCategoryOfType: (type) =>
    `Add at least one ${type === 'expense' ? 'expense' : 'income'} category first.`,
  btnAll: 'All',
  btnMonth: 'Current month',
  btnWeek: 'Week',
  btnDay: 'Today',
  choosePeriod: 'Choose a period:',
  btnWithDetails: 'With details',
  btnWithoutDetails: 'Without details',
  needDetails: 'Need details?',
  rateUnavailable: 'rate unavailable',
  nothingForPeriod: (type) =>
    `No ${type === 'expense' ? 'expenses' : 'income'} for the selected period 🙂`,
  statHeading: (type) => (type === 'expense' ? 'Expenses' : 'Income'),
  withDetailsHeading: (type) => `${type === 'expense' ? 'Expenses' : 'Income'} (detailed):\n\n`,
  total: 'Total',
  dateLocale: 'en-GB',
};

const bundles: Record<Locale, Messages> = { ru, en };

// Returns the message bundle for a locale.
export function t(locale: Locale): Messages {
  return bundles[locale];
}

export type MenuAction = 'viewCategories' | 'addCategory' | 'addIncome' | 'addExpense' | 'stat';

// Resolves an incoming reply-keyboard button press to a menu action, regardless
// of the locale the button was rendered in (a user may switch their Telegram
// language between rendering the keyboard and tapping it).
export function matchMenuAction(text: string): MenuAction | null {
  for (const locale of SUPPORTED_LOCALES) {
    const m = bundles[locale];
    if (text === m.menuViewCategories) return 'viewCategories';
    if (text === m.menuAddCategory) return 'addCategory';
    if (text === m.menuAddIncome) return 'addIncome';
    if (text === m.menuAddExpense) return 'addExpense';
    if (text === m.menuStat) return 'stat';
  }
  return null;
}
