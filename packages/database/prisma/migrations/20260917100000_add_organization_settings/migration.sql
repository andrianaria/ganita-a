ALTER TABLE "organizations" ADD COLUMN "business_type" TEXT;
ALTER TABLE "organizations" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}'::jsonb;
