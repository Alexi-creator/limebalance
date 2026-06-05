-- Снапшот стоимости операции в USD на момент создания (nullable).
-- Старые строки остаются NULL — статистика для них делает фолбэк по текущему курсу.
ALTER TABLE "expenses" ADD COLUMN "amount_usd" DECIMAL(14,2);
ALTER TABLE "incomes" ADD COLUMN "amount_usd" DECIMAL(14,2);
