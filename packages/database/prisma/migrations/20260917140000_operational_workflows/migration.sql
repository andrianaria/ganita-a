ALTER TABLE "outlets" ADD COLUMN "address" TEXT, ADD COLUMN "city" TEXT, ADD COLUMN "country" TEXT;
ALTER TYPE "SyncJobType" ADD VALUE 'TRANSACTION_IMPORT';
CREATE TABLE "team_invitations" (
  "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL, "role" "OrganizationRole" NOT NULL, "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL, "accepted_at" TIMESTAMPTZ, "revoked_at" TIMESTAMPTZ, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "team_invitations_organization_id_email_idx" ON "team_invitations"("organization_id", "email");
CREATE TABLE "inspections" (
  "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "outlet_id" UUID, "result" JSONB NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "inspections_organization_id_outlet_id_created_at_idx" ON "inspections"("organization_id", "outlet_id", "created_at");
CREATE TABLE "treatments" (
  "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "outlet_id" UUID NOT NULL, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "result_note" TEXT, "baseline" JSONB NOT NULL, "outcome" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "completed_at" TIMESTAMPTZ
);
CREATE INDEX "treatments_organization_id_outlet_id_idx" ON "treatments"("organization_id", "outlet_id");
CREATE TABLE "assistant_generations" (
  "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL, "outlet_id" UUID, "prompt" TEXT NOT NULL, "language" TEXT NOT NULL,
  "result" TEXT, "evidence" JSONB NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "usage" JSONB, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "assistant_generations_organization_id_user_id_created_at_idx" ON "assistant_generations"("organization_id", "user_id", "created_at");
