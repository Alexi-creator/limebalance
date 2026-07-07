-- Telegram @username for display in the admin panel (nullable: not every account has one)
ALTER TABLE "users" ADD COLUMN "telegram_username" TEXT;
