import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@ganita-ai/database";
import { requireAuth } from "../auth.js";
import { assertTenantReferences } from "../tenant.js";
import { movementInput, postMovement, repriceRecipes, convertQuantity } from "../stock.js";

function sourcePayload(request: FastifyRequest) {
  const dataSourceId = request.userContext?.apiKeyDataSourceId;
  const body = request.body;
  return dataSourceId && body && typeof body === "object" && !Array.isArray(body) ? { ...body, dataSourceId } : body;
}

const productSchema = z.object({
  brandId: z.string().uuid().optional(),
  dataSourceId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.string().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  active: z.boolean().default(true)
});

const ingredientSchema = z.object({
  dataSourceId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1),
  unit: z.string().min(1),
  currentCost: z.number().nonnegative()
});

const recipeItemSchema = z.object({
  recipeId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  estimatedCost: z.number().nonnegative().optional()
});

const recipeSchema = z.object({
  productId: z.string().uuid(),
  version: z.number().int().positive().default(1),
  name: z.string().min(1),
  yieldQuantity: z.number().positive().default(1),
  yieldUnit: z.string().min(1).default("portion"),
  active: z.boolean().default(true),
  notes: z.string().optional()
});

const stockLocationSchema = z.object({
  outletId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(["OUTLET", "WAREHOUSE", "COMMISSARY", "VIRTUAL"]),
  active: z.boolean().default(true)
});

const stockBalanceSchema = z.object({
  stockLocationId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  onHandQuantity: z.number().default(0),
  reservedQuantity: z.number().default(0),
  parLevel: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional(),
  unit: z.string().min(1),
  averageUnitCost: z.number().nonnegative().optional()
});

const stockMovementSchema = z.object({
  outletId: z.string().uuid().optional(),
  stockLocationId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  dataSourceId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  type: z.enum(["PURCHASE", "SALE_USAGE", "WASTE", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "PRODUCTION", "RETURN"]),
  occurredAt: z.coerce.date(),
  quantity: z.number(),
  unit: z.string().min(1),
  unitCost: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  reason: z.string().optional()
});

const supplierSchema = z.object({
  dataSourceId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  active: z.boolean().default(true)
});

export async function inventoryRoutes(app: FastifyInstance) {
  app.get("/v1/products", { preHandler: requireAuth }, async (request) => {
    const products = await prisma.product.findMany({
      where: { organizationId: request.userContext!.organizationId },
      orderBy: { name: "asc" }
    });
    return { data: products };
  });

  app.post("/v1/products", { preHandler: requireAuth }, async (request, reply) => {
    const body = productSchema.parse(sourcePayload(request));
    await assertTenantReferences(request.userContext!.organizationId, body);
    const product = await prisma.product.create({
      data: { ...body, organizationId: request.userContext!.organizationId }
    });
    return reply.code(201).send({ data: product });
  });

  app.get("/v1/ingredients", { preHandler: requireAuth }, async (request) => {
    const ingredients = await prisma.ingredient.findMany({
      where: { organizationId: request.userContext!.organizationId },
      orderBy: { name: "asc" }
    });
    return { data: ingredients };
  });

  app.post("/v1/ingredients", { preHandler: requireAuth }, async (request, reply) => {
    const body = ingredientSchema.parse(sourcePayload(request));
    await assertTenantReferences(request.userContext!.organizationId, body);
    const ingredient = await prisma.ingredient.create({
      data: { ...body, organizationId: request.userContext!.organizationId }
    });
    return reply.code(201).send({ data: ingredient });
  });

  app.get("/v1/recipes", { preHandler: requireAuth }, async (request) => {
    const recipes = await prisma.recipe.findMany({
      where: { organizationId: request.userContext!.organizationId },
      include: { product: true, items: { include: { ingredient: true } } },
      orderBy: [{ product: { name: "asc" } }, { version: "desc" }]
    });
    return { data: recipes };
  });

  app.post("/v1/recipes", { preHandler: requireAuth }, async (request, reply) => {
    const body = recipeSchema.parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const recipe = await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      if (body.active) await tx.recipe.updateMany({ where: { organizationId, productId: body.productId, active: true }, data: { active: false } });
      const created = await tx.recipe.create({ data: { ...body, organizationId } });
      await repriceRecipes(tx, organizationId, [body.productId]);
      return created;
    });
    return reply.code(201).send({ data: recipe });
  });

  app.get("/v1/products/:id/recipe-items", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const recipeItems = await prisma.recipeItem.findMany({
      where: { organizationId: request.userContext!.organizationId, productId: params.id },
      include: { ingredient: true },
      orderBy: { ingredient: { name: "asc" } }
    });
    return { data: recipeItems };
  });

  app.post("/v1/recipe-items", { preHandler: requireAuth }, async (request, reply) => {
    const body = recipeItemSchema.parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const recipeItem = await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const ingredient = await tx.ingredient.findFirstOrThrow({ where: { id: body.ingredientId, organizationId } });
      let recipe = await tx.recipe.findFirst({ where: { organizationId, productId: body.productId, ...(body.recipeId ? { id: body.recipeId } : { active: true }) }, orderBy: { version: "desc" } });
      if (!recipe) {
        if (body.recipeId) throw Object.assign(new Error("Resep tidak ditemukan."), { statusCode: 404 });
        const latest = await tx.recipe.findFirst({ where: { organizationId, productId: body.productId }, orderBy: { version: "desc" } });
        const product = await tx.product.findFirstOrThrow({ where: { organizationId, id: body.productId } });
        recipe = await tx.recipe.create({ data: { organizationId, productId: body.productId, name: product.name, version: (latest?.version ?? 0) + 1 } });
      }
      const item = await tx.recipeItem.create({ data: { ...body, recipeId: recipe.id, organizationId, estimatedCost: ingredient.currentCost.mul(convertQuantity(body.quantity, body.unit, ingredient.unit)) } });
      await repriceRecipes(tx, organizationId, [body.productId]);
      return item;
    });
    return reply.code(201).send({ data: recipeItem });
  });

  app.get("/v1/stock-locations", { preHandler: requireAuth }, async (request) => {
    const locations = await prisma.stockLocation.findMany({
      where: { organizationId: request.userContext!.organizationId },
      include: { outlet: true },
      orderBy: { name: "asc" }
    });
    return { data: locations };
  });

  app.post("/v1/stock-locations", { preHandler: requireAuth }, async (request, reply) => {
    const body = stockLocationSchema.parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const location = await prisma.stockLocation.create({
      data: { ...body, organizationId: request.userContext!.organizationId }
    });
    return reply.code(201).send({ data: location });
  });

  app.get("/v1/stock-balances", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ stockLocationId: z.string().uuid().optional() }).parse(request.query);
    const balances = await prisma.stockBalance.findMany({
      where: { organizationId: request.userContext!.organizationId, stockLocationId: query.stockLocationId },
      include: { ingredient: true, stockLocation: true },
      orderBy: { updatedAt: "desc" }
    });
    return { data: balances };
  });

  app.post("/v1/stock-balances", { preHandler: requireAuth }, async (request, reply) => {
    const body = stockBalanceSchema.parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const balance = await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const ingredient = await tx.ingredient.findFirstOrThrow({ where: { id: body.ingredientId, organizationId } });
      const location = await tx.stockLocation.findFirstOrThrow({ where: { id: body.stockLocationId, organizationId } });
      if (body.unit !== ingredient.unit || body.onHandQuantity < body.reservedQuantity || body.reservedQuantity < 0) throw Object.assign(new Error("Satuan atau jumlah saldo tidak valid."), { statusCode: 400 });
      const before = await tx.stockBalance.findUnique({ where: { stockLocationId_ingredientId: { stockLocationId: body.stockLocationId, ingredientId: body.ingredientId } } });
      if (before && before.unit !== body.unit) throw Object.assign(new Error("Satuan saldo lama berbeda; rekonsiliasi satuan diperlukan."), { statusCode: 409 });
      const delta = body.onHandQuantity - Number(before?.onHandQuantity ?? 0);
      if (delta) await tx.stockMovement.create({ data: { organizationId, stockLocationId: body.stockLocationId, ingredientId: body.ingredientId, outletId: location.outletId, quantity: delta, unit: body.unit, type: "ADJUSTMENT", occurredAt: new Date(), reason: "Rekonsiliasi saldo stok" } });
      return tx.stockBalance.upsert({
      where: { organizationId: request.userContext!.organizationId, stockLocationId_ingredientId: { stockLocationId: body.stockLocationId, ingredientId: body.ingredientId } },
      update: body,
      create: { ...body, organizationId: request.userContext!.organizationId }
      });
    });
    return reply.code(201).send({ data: balance });
  });

  app.get("/v1/stock-movements", { preHandler: requireAuth }, async (request) => {
    const query = z.object({ stockLocationId: z.string().uuid().optional(), ingredientId: z.string().uuid().optional() }).parse(request.query);
    const movements = await prisma.stockMovement.findMany({
      where: {
        organizationId: request.userContext!.organizationId,
        stockLocationId: query.stockLocationId,
        ingredientId: query.ingredientId
      },
      include: { ingredient: true, stockLocation: true, outlet: true },
      orderBy: { occurredAt: "desc" },
      take: 100
    });
    return { data: movements };
  });

  app.post("/v1/stock-movements", { preHandler: requireAuth }, async (request, reply) => {
    const body = movementInput.parse(sourcePayload(request));
    await assertTenantReferences(request.userContext!.organizationId, body);
    const movement = await postMovement(request.userContext!.organizationId, body);
    return reply.code(201).send({ data: movement });
  });

  app.get("/v1/suppliers", { preHandler: requireAuth }, async (request) => {
    const suppliers = await prisma.supplier.findMany({
      where: { organizationId: request.userContext!.organizationId },
      orderBy: { name: "asc" }
    });
    return { data: suppliers };
  });

  app.post("/v1/suppliers", { preHandler: requireAuth }, async (request, reply) => {
    const body = supplierSchema.parse(sourcePayload(request));
    await assertTenantReferences(request.userContext!.organizationId, body);
    const supplier = await prisma.supplier.create({
      data: { ...body, organizationId: request.userContext!.organizationId }
    });
    return reply.code(201).send({ data: supplier });
  });

  app.patch("/v1/products/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = productSchema.partial().parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    return { data: await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      await tx.product.update({ where: { id, organizationId }, data: body });
      await repriceRecipes(tx, organizationId, [id]);
      return tx.product.findUniqueOrThrow({ where: { id, organizationId } });
    }) };
  });
  app.delete("/v1/products/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await prisma.product.update({ where: { id, organizationId: request.userContext!.organizationId }, data: { active: false } }) };
  });
  app.patch("/v1/ingredients/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = ingredientSchema.omit({ unit: true }).partial().parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    return { data: await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const item = await tx.ingredient.update({ where: { id, organizationId }, data: body });
      const recipes = await tx.recipeItem.findMany({ where: { ingredientId: id, organizationId }, select: { productId: true } });
      await repriceRecipes(tx, organizationId, recipes.map(r => r.productId));
      return item;
    }) };
  });
  app.put("/v1/products/:id/recipe", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().trim().min(1), yieldQuantity: z.number().positive(), items: z.array(z.object({ ingredientId: z.string().uuid(), quantity: z.number().positive(), unit: z.string().min(1) })).min(1).max(200) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    await assertTenantReferences(organizationId, { productId: id });
    for (const item of body.items) await assertTenantReferences(organizationId, item);
    return { data: await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const latest = await tx.recipe.findFirst({ where: { organizationId, productId: id }, orderBy: { version: "desc" } });
      await tx.recipe.updateMany({ where: { organizationId, productId: id }, data: { active: false } });
      const recipe = await tx.recipe.create({ data: { organizationId, productId: id, name: body.name, yieldQuantity: body.yieldQuantity, version: (latest?.version ?? 0) + 1,
        items: { create: body.items.map(item => ({ ...item, organizationId, productId: id, estimatedCost: 0 })) } } });
      await repriceRecipes(tx, organizationId, [id]);
      return tx.recipe.findUniqueOrThrow({ where: { id: recipe.id }, include: { items: true, product: true } });
    }) };
  });
}
