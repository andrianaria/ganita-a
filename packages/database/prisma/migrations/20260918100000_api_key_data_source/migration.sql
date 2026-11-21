-- Existing keys remain organization-level; never guess their historical source.
ALTER TABLE "api_keys" ADD COLUMN "data_source_id" UUID;
CREATE UNIQUE INDEX "data_sources_id_organization_id_key" ON "data_sources"("id", "organization_id");
CREATE INDEX "api_keys_data_source_id_organization_id_idx" ON "api_keys"("data_source_id", "organization_id");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_data_source_id_organization_id_fkey"
  FOREIGN KEY ("data_source_id", "organization_id") REFERENCES "data_sources"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
