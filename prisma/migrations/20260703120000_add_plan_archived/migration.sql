-- Soft retirement for plans: a plan can be pulled from sale without deleting it, so paid subscribers
-- keep their functionality until their subscription expires. NULL = active; a timestamp = archived.
ALTER TABLE "plans" ADD COLUMN "archived_at" TIMESTAMP(3);
