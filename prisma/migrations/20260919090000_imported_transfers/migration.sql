-- CreateEnum
CREATE TYPE "TransferSource" AS ENUM ('MANUAL', 'BYBIT');

-- AlterTable
ALTER TABLE "investing_transfers" ADD COLUMN     "counterparty" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "TransferSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "tx_id" TEXT;

-- AlterTable
ALTER TABLE "investing_venues" ADD COLUMN     "fund_usd" DECIMAL(20,8),
ADD COLUMN     "movements_synced_to" TIMESTAMP(3),
ADD COLUMN     "opening_fund_at" TIMESTAMP(3),
ADD COLUMN     "opening_fund_usd" DECIMAL(20,8);

-- CreateIndex
CREATE UNIQUE INDEX "investing_transfers_venue_id_external_id_key" ON "investing_transfers"("venue_id", "external_id");
