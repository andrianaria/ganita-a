-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('OUTLET', 'WAREHOUSE', 'COMMISSARY', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE_USAGE', 'WASTE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'PRODUCTION', 'RETURN');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MappedEntityType" AS ENUM ('OUTLET', 'PRODUCT', 'INGREDIENT', 'SUPPLIER', 'RECIPE', 'STOCK_LOCATION');

-- AlterTable
ALTER TABLE "recipe_items" ADD COLUMN     "recipe_id" UUID;

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "yield_quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "yield_unit" TEXT NOT NULL DEFAULT 'portion',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_source_id" UUID,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "StockLocationType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "on_hand_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "par_level" DECIMAL(18,4),
    "reorder_point" DECIMAL(18,4),
    "unit" TEXT NOT NULL,
    "average_unit_cost" DECIMAL(18,4),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID,
    "stock_location_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "data_source_id" UUID,
    "external_id" TEXT,
    "type" "StockMovementType" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_cost" DECIMAL(18,4),
    "total_cost" DECIMAL(18,2),
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "outlet_id" UUID,
    "supplier_id" UUID,
    "order_number" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "ordered_at" TIMESTAMPTZ(6),
    "expected_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_ordered" DECIMAL(18,4) NOT NULL,
    "quantity_received" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_entity_mappings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "entity_type" "MappedEntityType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "canonical_id" UUID NOT NULL,
    "external_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_entity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipes_organization_id_idx" ON "recipes"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_product_id_version_key" ON "recipes"("product_id", "version");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_idx" ON "suppliers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_data_source_id_external_id_key" ON "suppliers"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "stock_locations_organization_id_idx" ON "stock_locations"("organization_id");

-- CreateIndex
CREATE INDEX "stock_locations_outlet_id_idx" ON "stock_locations"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_organization_id_name_key" ON "stock_locations"("organization_id", "name");

-- CreateIndex
CREATE INDEX "stock_balances_organization_id_idx" ON "stock_balances"("organization_id");

-- CreateIndex
CREATE INDEX "stock_balances_ingredient_id_idx" ON "stock_balances"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_stock_location_id_ingredient_id_key" ON "stock_balances"("stock_location_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_idx" ON "stock_movements"("organization_id");

-- CreateIndex
CREATE INDEX "stock_movements_stock_location_id_occurred_at_idx" ON "stock_movements"("stock_location_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_ingredient_id_occurred_at_idx" ON "stock_movements"("ingredient_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_data_source_id_external_id_key" ON "stock_movements"("data_source_id", "external_id");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_idx" ON "purchase_orders"("organization_id");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_order_number_key" ON "purchase_orders"("organization_id", "order_number");

-- CreateIndex
CREATE INDEX "purchase_order_items_organization_id_idx" ON "purchase_order_items"("organization_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_ingredient_id_idx" ON "purchase_order_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "external_entity_mappings_organization_id_entity_type_canoni_idx" ON "external_entity_mappings"("organization_id", "entity_type", "canonical_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_entity_mappings_data_source_id_entity_type_externa_key" ON "external_entity_mappings"("data_source_id", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "recipe_items_recipe_id_idx" ON "recipe_items"("recipe_id");

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_entity_mappings" ADD CONSTRAINT "external_entity_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
