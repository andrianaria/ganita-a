DROP INDEX "transactions_data_source_id_external_id_key";
CREATE UNIQUE INDEX "transactions_data_source_id_outlet_id_external_id_key" ON "transactions"("data_source_id", "outlet_id", "external_id");
ALTER TABLE "daily_outlet_metrics" ADD COLUMN "cost_complete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "daily_outlet_metrics" ADD COLUMN "opex_complete" BOOLEAN NOT NULL DEFAULT false;
