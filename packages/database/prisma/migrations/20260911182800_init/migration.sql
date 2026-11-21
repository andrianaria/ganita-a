-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "OutletStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('STREET_SUSHI_POS', 'GANITA_POS', 'CSV', 'OTHER');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARY', 'UTILITY', 'MARKETING', 'DELIVERY_PLATFORM', 'MAINTENANCE', 'SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'ATTENTION', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HealthIssueType" AS ENUM ('HIGH_HPP', 'HIGH_OPEX', 'SALES_DECLINE', 'EXCESSIVE_DISCOUNT', 'MARGIN_DECLINE', 'HIGH_LABOR_COST', 'INVENTORY_ANOMALY', 'LOW_AVERAGE_ORDER');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('INITIAL_IMPORT', 'INCREMENTAL_SYNC');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_users" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_users_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "status" "OutletStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connection_secret_ref" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_data_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "external_outlet_id" TEXT NOT NULL,

    CONSTRAINT "outlet_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "transaction_number" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "gross_sales" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "service_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(18,2) NOT NULL,
    "total_cost" DECIMAL(18,2),
    "payment_method" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "external_id" TEXT,
    "product_id" UUID,
    "product_name_snapshot" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "unit_cost" DECIMAL(18,4),
    "total_cost" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "brand_id" UUID,
    "data_source_id" UUID,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "selling_price" DECIMAL(18,2),
    "estimated_cost" DECIMAL(18,4),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_source_id" UUID,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "current_cost" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimated_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "data_source_id" UUID,
    "external_id" TEXT,
    "expense_date" DATE NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_outlet_metrics" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "gross_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_sales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "average_order_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hpp_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "opex" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "opex_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_margin_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_outlet_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_health_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "health_policy_version" TEXT NOT NULL DEFAULT 'mvp-v1',
    "overall_score" INTEGER NOT NULL,
    "revenue_score" INTEGER NOT NULL,
    "margin_score" INTEGER NOT NULL,
    "cost_score" INTEGER NOT NULL,
    "operations_score" INTEGER NOT NULL,
    "inventory_score" INTEGER,
    "status" "HealthStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlet_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_issues" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "snapshot_id" UUID,
    "type" "HealthIssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "current_value" DECIMAL(18,4),
    "previous_value" DECIMAL(18,4),
    "target_value" DECIMAL(18,4),
    "financial_impact_estimate" DECIMAL(18,2),
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "health_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "health_issue_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommended_actions_json" JSONB NOT NULL,
    "model_provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "type" "SyncJobType" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "range_from" TIMESTAMPTZ(6),
    "range_to" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organization_users_user_id_idx" ON "organization_users"("user_id");

-- CreateIndex
CREATE INDEX "brands_organization_id_idx" ON "brands"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_organization_id_slug_key" ON "brands"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "outlets_organization_id_idx" ON "outlets"("organization_id");

-- CreateIndex
CREATE INDEX "outlets_brand_id_idx" ON "outlets"("brand_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_organization_id_code_key" ON "outlets"("organization_id", "code");

-- CreateIndex
CREATE INDEX "data_sources_organization_id_idx" ON "data_sources"("organization_id");

-- CreateIndex
CREATE INDEX "outlet_data_sources_organization_id_outlet_id_idx" ON "outlet_data_sources"("organization_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_data_sources_data_source_id_external_outlet_id_key" ON "outlet_data_sources"("data_source_id", "external_outlet_id");

-- CreateIndex
CREATE INDEX "transactions_organization_id_idx" ON "transactions"("organization_id");

-- CreateIndex
CREATE INDEX "transactions_outlet_id_occurred_at_idx" ON "transactions"("outlet_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_organization_id_outlet_id_occurred_at_idx" ON "transactions"("organization_id", "outlet_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_data_source_id_external_id_key" ON "transactions"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "transaction_items_organization_id_idx" ON "transaction_items"("organization_id");

-- CreateIndex
CREATE INDEX "transaction_items_outlet_id_idx" ON "transaction_items"("outlet_id");

-- CreateIndex
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_data_source_id_external_id_key" ON "products"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "ingredients_organization_id_idx" ON "ingredients"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_data_source_id_external_id_key" ON "ingredients"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "recipe_items_organization_id_idx" ON "recipe_items"("organization_id");

-- CreateIndex
CREATE INDEX "recipe_items_product_id_idx" ON "recipe_items"("product_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_idx" ON "expenses"("organization_id");

-- CreateIndex
CREATE INDEX "expenses_outlet_id_expense_date_idx" ON "expenses"("outlet_id", "expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_data_source_id_external_id_key" ON "expenses"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "daily_outlet_metrics_organization_id_idx" ON "daily_outlet_metrics"("organization_id");

-- CreateIndex
CREATE INDEX "daily_outlet_metrics_organization_id_outlet_id_metric_date_idx" ON "daily_outlet_metrics"("organization_id", "outlet_id", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_outlet_metrics_outlet_id_metric_date_key" ON "daily_outlet_metrics"("outlet_id", "metric_date");

-- CreateIndex
CREATE INDEX "outlet_health_snapshots_organization_id_idx" ON "outlet_health_snapshots"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_health_snapshots_outlet_id_snapshot_date_key" ON "outlet_health_snapshots"("outlet_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "health_issues_organization_id_idx" ON "health_issues"("organization_id");

-- CreateIndex
CREATE INDEX "health_issues_outlet_id_status_idx" ON "health_issues"("outlet_id", "status");

-- CreateIndex
CREATE INDEX "health_issues_snapshot_id_idx" ON "health_issues"("snapshot_id");

-- CreateIndex
CREATE INDEX "insights_organization_id_idx" ON "insights"("organization_id");

-- CreateIndex
CREATE INDEX "insights_outlet_id_idx" ON "insights"("outlet_id");

-- CreateIndex
CREATE INDEX "sync_jobs_organization_id_idx" ON "sync_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "sync_jobs_data_source_id_created_at_idx" ON "sync_jobs"("data_source_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_data_sources" ADD CONSTRAINT "outlet_data_sources_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_data_sources" ADD CONSTRAINT "outlet_data_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_data_sources" ADD CONSTRAINT "outlet_data_sources_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_outlet_metrics" ADD CONSTRAINT "daily_outlet_metrics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_outlet_metrics" ADD CONSTRAINT "daily_outlet_metrics_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_health_snapshots" ADD CONSTRAINT "outlet_health_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_health_snapshots" ADD CONSTRAINT "outlet_health_snapshots_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_issues" ADD CONSTRAINT "health_issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_issues" ADD CONSTRAINT "health_issues_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_issues" ADD CONSTRAINT "health_issues_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "outlet_health_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_health_issue_id_fkey" FOREIGN KEY ("health_issue_id") REFERENCES "health_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
