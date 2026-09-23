-- AlterTable
ALTER TABLE "investing_transfers" ADD COLUMN     "expense_id" TEXT,
ADD COLUMN     "income_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "investing_transfers_income_id_key" ON "investing_transfers"("income_id");

-- CreateIndex
CREATE UNIQUE INDEX "investing_transfers_expense_id_key" ON "investing_transfers"("expense_id");

-- AddForeignKey
ALTER TABLE "investing_transfers" ADD CONSTRAINT "investing_transfers_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_transfers" ADD CONSTRAINT "investing_transfers_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
