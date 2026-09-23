-- AlterTable
-- Stored copies of two figures the diary shows, so it can sort by them in SQL. Both are NULL while
-- the position is open (no closed_pnl / closed_at yet) — those rows sort last. A generated column
-- can't reference another one, so the ROI repeats entry_volume_usd's expression inline.
ALTER TABLE "positions"
-- Realized PnL against the capital committed at entry, in percent (same as the UI's ROI column).
ADD COLUMN "roi_pct" DECIMAL(30,12)
GENERATED ALWAYS AS ("closed_pnl" * 100 / NULLIF("qty" * "avg_entry_price" / COALESCE(NULLIF("leverage", 0), 1), 0)) STORED,
-- Time held, in seconds. NULL as well when opened_at is unknown.
ADD COLUMN "duration_sec" DECIMAL(20,3)
GENERATED ALWAYS AS (EXTRACT(EPOCH FROM ("closed_at" - "opened_at"))) STORED;
