-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "date" DROP DEFAULT;

-- AlterTable
ALTER TABLE "incomes" ALTER COLUMN "date" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
