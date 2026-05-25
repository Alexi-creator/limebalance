import { Module } from '@nestjs/common';
import { ExpenseCategoriesModule } from '../modules/expense-categories/expense-categories.module';
import { ExpensesModule } from '../modules/expenses/expenses.module';
import { IncomeCategoriesModule } from '../modules/income-categories/income-categories.module';
import { IncomesModule } from '../modules/incomes/incomes.module';
import { UsersModule } from '../modules/users/users.module';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { CategoryHandler } from './handlers/category.handler';
import { ExpenseHandler } from './handlers/expense.handler';
import { IncomeHandler } from './handlers/income.handler';
import { StartHandler } from './handlers/start.handler';
import { StatHandler } from './handlers/stat.handler';
import { StateService } from './state.service';

@Module({
  imports: [UsersModule, ExpenseCategoriesModule, ExpensesModule, IncomeCategoriesModule, IncomesModule],
  controllers: [BotController],
  providers: [BotService, StateService, StartHandler, CategoryHandler, ExpenseHandler, IncomeHandler, StatHandler],
})
export class BotModule {}
