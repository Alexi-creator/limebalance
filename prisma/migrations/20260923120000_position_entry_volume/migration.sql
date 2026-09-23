-- AlterTable
-- Capital committed at entry, in USDT — the same qty x price / leverage the API already returns
-- as entryVolumeUsd, but stored, so the diary can filter sub-dollar dust in SQL. GENERATED keeps
-- it in step with every write path (sync, upsert, manual edit) without any app-side bookkeeping.
ALTER TABLE "positions"
ADD COLUMN "entry_volume_usd" DECIMAL(30,12)
-- NULLIF guards the one value that would make this expression throw on insert.
GENERATED ALWAYS AS ("qty" * "avg_entry_price" / COALESCE(NULLIF("leverage", 0), 1)) STORED;
