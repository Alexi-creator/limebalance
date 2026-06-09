/*
  Warnings:

  - Made the column `name` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing NULL names before enforcing NOT NULL
UPDATE "users" SET "name" = '' WHERE "name" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "name" SET DEFAULT '';
