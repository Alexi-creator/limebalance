-- title/body become an optional fallback; templated notifications are localized
-- by the frontend from `payload`. Free-form items (e.g. news) may still use them.
ALTER TABLE "notifications" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "body" DROP NOT NULL;
