-- AlterTable: add nullable, backfill existing rows to THB, then enforce NOT NULL
ALTER TABLE "expenses" ADD COLUMN "currency" TEXT;
UPDATE "expenses" SET "currency" = 'THB' WHERE "currency" IS NULL;
ALTER TABLE "expenses" ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "incomes" ADD COLUMN "currency" TEXT;
UPDATE "incomes" SET "currency" = 'THB' WHERE "currency" IS NULL;
ALTER TABLE "incomes" ALTER COLUMN "currency" SET NOT NULL;
