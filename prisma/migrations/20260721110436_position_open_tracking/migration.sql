
-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- DropForeignKey
ALTER TABLE "closed_positions" DROP CONSTRAINT "closed_positions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "closed_positions" DROP CONSTRAINT "closed_positions_user_id_fkey";

-- DropTable
DROP TABLE "closed_positions";

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bybit',
    "status" "PositionStatus" NOT NULL DEFAULT 'CLOSED',
    "order_id" TEXT,
    "symbol" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(30,12) NOT NULL,
    "avg_entry_price" DECIMAL(30,12) NOT NULL,
    "avg_exit_price" DECIMAL(30,12),
    "closed_pnl" DECIMAL(30,12),
    "leverage" DECIMAL(10,2),
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_notes" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "position_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_user_id_closed_at_idx" ON "positions"("user_id", "closed_at");

-- CreateIndex
CREATE INDEX "positions_account_id_symbol_closed_at_idx" ON "positions"("account_id", "symbol", "closed_at");

-- CreateIndex
CREATE INDEX "positions_account_id_symbol_category_status_idx" ON "positions"("account_id", "symbol", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "positions_account_id_order_id_key" ON "positions"("account_id", "order_id");

-- CreateIndex
CREATE INDEX "position_notes_position_id_created_at_idx" ON "position_notes"("position_id", "created_at");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "exchange_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_notes" ADD CONSTRAINT "position_notes_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_notes" ADD CONSTRAINT "position_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

