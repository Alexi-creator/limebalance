-- Plans now differ by feature access (investing / crypto section), not by record limits.
-- Add the feature flag, then refresh plan pricing & limits (idempotent).
ALTER TABLE "plans" ADD COLUMN "investingAccess" BOOLEAN NOT NULL DEFAULT false;

-- free:  unlimited, no investing section, $0
-- pro:   unlimited + investing section, $12 / month
-- ultra: unlimited + investing section, $100 lifetime
INSERT INTO "plans" ("id", "name", "maxCategories", "maxExpenses", "maxIncomes", "price", "investingAccess") VALUES
  (gen_random_uuid(), 'free',  NULL, NULL, NULL, 0,   false),
  (gen_random_uuid(), 'pro',   NULL, NULL, NULL, 12,  true),
  (gen_random_uuid(), 'ultra', NULL, NULL, NULL, 100, true)
ON CONFLICT ("name") DO UPDATE SET
  "maxCategories"   = EXCLUDED."maxCategories",
  "maxExpenses"     = EXCLUDED."maxExpenses",
  "maxIncomes"      = EXCLUDED."maxIncomes",
  "price"           = EXCLUDED."price",
  "investingAccess" = EXCLUDED."investingAccess";
