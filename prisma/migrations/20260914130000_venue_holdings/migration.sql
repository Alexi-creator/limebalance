-- AlterTable
ALTER TABLE "holdings" ADD COLUMN     "venue_id" TEXT;

-- CreateIndex
CREATE INDEX "holdings_venue_id_idx" ON "holdings"("venue_id");

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "investing_venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

