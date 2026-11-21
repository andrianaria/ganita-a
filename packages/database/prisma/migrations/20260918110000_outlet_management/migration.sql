ALTER TABLE "outlets"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "opening_hours" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "profile_managed_locally" BOOLEAN NOT NULL DEFAULT false;
