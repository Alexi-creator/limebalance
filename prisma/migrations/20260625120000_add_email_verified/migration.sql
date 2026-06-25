-- Email-registered accounts now require confirmation (soft verification: the user is let in
-- immediately, but the email is flagged unverified until the confirmation link is followed).

-- New flag on users. Default false; existing accounts that already have an email are treated as
-- verified (they predate this feature and were not gated).
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "email_verified" = true WHERE "email" IS NOT NULL;

-- The registration flow stores no pending password in the verification token (it already lives on
-- the user), so the column becomes nullable.
ALTER TABLE "email_verification_tokens" ALTER COLUMN "password" DROP NOT NULL;
