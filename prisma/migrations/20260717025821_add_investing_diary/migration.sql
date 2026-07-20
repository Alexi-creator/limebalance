-- CreateEnum
CREATE TYPE "ExchangeAccountStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISABLED');

-- CreateTable
CREATE TABLE "exchange_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'bybit',
    "label" TEXT NOT NULL DEFAULT '',
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT NOT NULL,
    "status" "ExchangeAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_error" TEXT,
    "sync_from" TIMESTAMP(3) NOT NULL,
    "closed_pnl_synced_to" TIMESTAMP(3),
    "executions_synced_to" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_executions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exec_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DECIMAL(30,12) NOT NULL,
    "qty" DECIMAL(30,12) NOT NULL,
    "fee" DECIMAL(30,12) NOT NULL,
    "fee_currency" TEXT,
    "exec_time" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closed_positions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(30,12) NOT NULL,
    "avg_entry_price" DECIMAL(30,12) NOT NULL,
    "avg_exit_price" DECIMAL(30,12) NOT NULL,
    "closed_pnl" DECIMAL(30,12) NOT NULL,
    "leverage" DECIMAL(10,2),
    "closed_at" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closed_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_accounts_user_id_idx" ON "exchange_accounts"("user_id");

-- CreateIndex
CREATE INDEX "exchange_accounts_status_idx" ON "exchange_accounts"("status");

-- CreateIndex
CREATE INDEX "trade_executions_user_id_exec_time_idx" ON "trade_executions"("user_id", "exec_time");

-- CreateIndex
CREATE INDEX "trade_executions_account_id_symbol_exec_time_idx" ON "trade_executions"("account_id", "symbol", "exec_time");

-- CreateIndex
CREATE UNIQUE INDEX "trade_executions_account_id_exec_id_key" ON "trade_executions"("account_id", "exec_id");

-- CreateIndex
CREATE INDEX "closed_positions_user_id_closed_at_idx" ON "closed_positions"("user_id", "closed_at");

-- CreateIndex
CREATE INDEX "closed_positions_account_id_symbol_closed_at_idx" ON "closed_positions"("account_id", "symbol", "closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "closed_positions_account_id_order_id_key" ON "closed_positions"("account_id", "order_id");

-- AddForeignKey
ALTER TABLE "exchange_accounts" ADD CONSTRAINT "exchange_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "exchange_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_positions" ADD CONSTRAINT "closed_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "exchange_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_positions" ADD CONSTRAINT "closed_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
