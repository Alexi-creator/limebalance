-- CreateEnum
CREATE TYPE "VenueMode" AS ENUM ('LIVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransferPeer" AS ENUM ('LEDGER', 'VENUE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "investing_venues" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_id" TEXT,
    "mode" "VenueMode" NOT NULL DEFAULT 'MANUAL',
    "balance_usd" DECIMAL(20,8),
    "balance_at" TIMESTAMP(3),
    "coins" JSONB,
    "opening_usd" DECIMAL(20,8),
    "opening_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investing_venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investing_transfers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "direction" "TransferDirection" NOT NULL,
    "peer" "TransferPeer" NOT NULL,
    "peer_venue_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_usd" DECIMAL(20,8),
    "note" TEXT,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investing_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investing_adjustments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(20,8) NOT NULL,
    "note" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investing_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investing_venues_account_id_key" ON "investing_venues"("account_id");

-- CreateIndex
CREATE INDEX "investing_venues_user_id_archived_idx" ON "investing_venues"("user_id", "archived");

-- CreateIndex
CREATE INDEX "investing_transfers_user_id_date_idx" ON "investing_transfers"("user_id", "date");

-- CreateIndex
CREATE INDEX "investing_transfers_venue_id_date_idx" ON "investing_transfers"("venue_id", "date");

-- CreateIndex
CREATE INDEX "investing_adjustments_venue_id_date_idx" ON "investing_adjustments"("venue_id", "date");

-- AddForeignKey
ALTER TABLE "investing_venues" ADD CONSTRAINT "investing_venues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_venues" ADD CONSTRAINT "investing_venues_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "exchange_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_transfers" ADD CONSTRAINT "investing_transfers_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "investing_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_transfers" ADD CONSTRAINT "investing_transfers_peer_venue_id_fkey" FOREIGN KEY ("peer_venue_id") REFERENCES "investing_venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_transfers" ADD CONSTRAINT "investing_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_adjustments" ADD CONSTRAINT "investing_adjustments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "investing_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investing_adjustments" ADD CONSTRAINT "investing_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

