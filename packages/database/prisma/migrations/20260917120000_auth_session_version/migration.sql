ALTER TABLE "users" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
-- Clerk identities never have a local password. Invalidate legacy internal tokens.
UPDATE "users" SET "password_hash" = '' WHERE "clerk_user_id" IS NOT NULL;
