-- Promote the owner account to ADMIN so they (and only they) can access the admin panel.
-- Mirrors the owner-promotion step in prisma/seed.ts so it runs in production via
-- `prisma migrate deploy` without requiring ts-node (a devDependency, absent in the prod image).
-- Idempotent: re-running only re-sets the role to its current value.
UPDATE "users" SET "role" = 'ADMIN' WHERE "email" = 'pavlov.il.creator@gmail.com';
