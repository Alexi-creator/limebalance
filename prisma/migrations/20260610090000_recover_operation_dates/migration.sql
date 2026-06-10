-- Data recovery (one-time).
--
-- The migration 20260528102049_add_date_to_expenses_incomes added
--   `date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
-- which, on its first run against the production database (2026-06-09), stamped EVERY
-- pre-existing row with the migration run date instead of the real operation date.
-- All historical operations collapsed to 2026-06-09.
--
-- The real date survives in `created_at` (the old system ordered by it before `date`
-- existed). Restore `date` from `created_at`, converted to local time (THB, UTC+7).
--
-- Only touch rows that were stamped with the collapse date (2026-06-09) AND created
-- before it — i.e. exactly the pre-migration rows. Rows created on/after 2026-06-09
-- (bot/LK after the deploy) keep their correct date. On a fresh database there are no
-- such rows, so this is a no-op.

UPDATE "expenses"
SET "date" = (("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date
WHERE "date" = DATE '2026-06-09'
  AND "created_at" < DATE '2026-06-09';

UPDATE "incomes"
SET "date" = (("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date
WHERE "date" = DATE '2026-06-09'
  AND "created_at" < DATE '2026-06-09';
