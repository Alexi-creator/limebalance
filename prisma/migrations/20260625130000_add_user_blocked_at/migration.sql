-- Admin-controlled account block. NULL = active; a timestamp records that the account is blocked
-- and when. Blocked users are rejected at the JWT layer, so existing sessions stop working too.
ALTER TABLE "users" ADD COLUMN "blocked_at" TIMESTAMP(3);
