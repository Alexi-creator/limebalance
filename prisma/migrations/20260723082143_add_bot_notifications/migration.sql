-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language_code" TEXT;

-- CreateTable
CREATE TABLE "bot_notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_notification_preferences_user_id_type_key" ON "bot_notification_preferences"("user_id", "type");

-- AddForeignKey
ALTER TABLE "bot_notification_preferences" ADD CONSTRAINT "bot_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
