-- AlterTable
ALTER TABLE "exchange_accounts" ADD COLUMN     "p2p_error" TEXT,
ADD COLUMN     "p2p_synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "p2p_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "order_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "quantity" DECIMAL(30,12) NOT NULL,
    "fiat_amount" DECIMAL(20,2) NOT NULL,
    "fiat_currency" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "fee" DECIMAL(30,12),
    "counterparty" TEXT,
    "status" INTEGER NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p2p_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "p2p_orders_user_id_placed_at_idx" ON "p2p_orders"("user_id", "placed_at");

-- CreateIndex
CREATE UNIQUE INDEX "p2p_orders_user_id_order_id_key" ON "p2p_orders"("user_id", "order_id");

-- AddForeignKey
ALTER TABLE "p2p_orders" ADD CONSTRAINT "p2p_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_orders" ADD CONSTRAINT "p2p_orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "exchange_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
