-- Seed reference data: subscription plans (idempotent).
-- Mirrors prisma/seed.ts so it runs in production via `prisma migrate deploy`
-- without requiring ts-node (which is a devDependency, absent in the prod image).
INSERT INTO "plans" ("id", "name", "maxCategories", "maxExpenses", "maxIncomes", "price") VALUES
  (gen_random_uuid(), 'free', 3, 50, 50, 0),
  (gen_random_uuid(), 'pro', 15, NULL, NULL, 0),
  (gen_random_uuid(), 'ultra', NULL, NULL, NULL, 0)
ON CONFLICT ("name") DO NOTHING;
