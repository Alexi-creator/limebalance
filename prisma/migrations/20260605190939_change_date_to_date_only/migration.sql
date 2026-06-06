-- DropIndex
DROP INDEX "expenses_user_id_date_idx";

-- DropIndex
DROP INDEX "incomes_user_id_date_idx";

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "incomes" ALTER COLUMN "date" SET DATA TYPE DATE;

-- CreateIndex
CREATE INDEX "expenses_user_id_date_created_at_idx" ON "expenses"("user_id", "date", "created_at");

-- CreateIndex
CREATE INDEX "incomes_user_id_date_created_at_idx" ON "incomes"("user_id", "date", "created_at");
