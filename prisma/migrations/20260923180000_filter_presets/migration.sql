-- CreateEnum
CREATE TYPE "FilterPresetScope" AS ENUM ('TRANSACTIONS', 'POSITIONS');

-- CreateTable
CREATE TABLE "filter_presets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" "FilterPresetScope" NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "filters_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filter_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filter_presets_user_id_scope_filters_hash_key" ON "filter_presets"("user_id", "scope", "filters_hash");

-- CreateIndex
CREATE UNIQUE INDEX "filter_presets_user_id_scope_name_key" ON "filter_presets"("user_id", "scope", "name");

-- AddForeignKey
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
