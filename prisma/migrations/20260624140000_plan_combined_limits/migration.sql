-- Free tier caps: total categories (expense + income, lifetime) and transactions per calendar
-- month (expenses + incomes). Per-type expense/income caps are replaced by these two.
ALTER TABLE "plans" DROP COLUMN "maxExpenses";
ALTER TABLE "plans" DROP COLUMN "maxIncomes";
ALTER TABLE "plans" ADD COLUMN "maxTransactionsPerMonth" INTEGER;

-- free: 5 categories total, 20 transactions / month; pro/ultra: unlimited
UPDATE "plans" SET "maxCategories" = 5,    "maxTransactionsPerMonth" = 20   WHERE "name" = 'free';
UPDATE "plans" SET "maxCategories" = NULL, "maxTransactionsPerMonth" = NULL WHERE "name" IN ('pro', 'ultra');
