import { prisma, Prisma } from "@ganita-ai/database";
import { z } from "zod";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const units: Record<string, [string, number]> = { kg: ["mass", 1000], g: ["mass", 1], l: ["volume", 1000], ml: ["volume", 1], pcs: ["count", 1], piece: ["count", 1] };
export function convertQuantity(quantity: number, from: string, to: string) {
  if (from === to) return quantity;
  const a = units[from.toLowerCase()], b = units[to.toLowerCase()];
  if (!a || !b || a[0] !== b[0]) throw fail(`Satuan ${from} tidak dapat dikonversi menjadi ${to}.`);
  return quantity * a[1] / b[1];
}
export const movementInput = z.object({
  id: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(), stockLocationId: z.string().uuid(), ingredientId: z.string().uuid(),
  dataSourceId: z.string().uuid().optional(), externalId: z.string().trim().min(1).optional(),
  type: z.enum(["PURCHASE", "SALE_USAGE", "WASTE", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "PRODUCTION", "RETURN"]),
  occurredAt: z.coerce.date(), quantity: z.number().finite().refine(v => v !== 0), unit: z.string().min(1),
  unitCost: z.number().finite().nonnegative().optional(), totalCost: z.number().finite().nonnegative().optional(),
  referenceType: z.string().optional(), referenceId: z.string().optional(), reason: z.string().trim().min(1).max(500),
}).refine(v => Boolean(v.dataSourceId) === Boolean(v.externalId), "dataSourceId dan externalId harus diisi bersama.");

export function signedQuantity(type: string, quantity: number) {
  if (["SALE_USAGE", "WASTE", "TRANSFER_OUT"].includes(type)) return -Math.abs(quantity);
  if (["PURCHASE", "TRANSFER_IN", "PRODUCTION", "RETURN"].includes(type)) {
    if (quantity <= 0) throw fail("Jumlah stok masuk harus positif.");
  }
  return quantity;
}

export async function postMovement(organizationId: string, body: z.infer<typeof movementInput>) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    const ingredient = await tx.ingredient.findFirstOrThrow({ where: { organizationId, id: body.ingredientId } });
    const location = await tx.stockLocation.findFirstOrThrow({ where: { organizationId, id: body.stockLocationId, active: true } });
    if (body.outletId && body.outletId !== location.outletId) throw fail("Lokasi stok tidak sesuai outlet.");
    const quantity = new Prisma.Decimal(convertQuantity(signedQuantity(body.type, body.quantity), body.unit, ingredient.unit)).toDecimalPlaces(4);
    if (quantity.isZero()) throw fail("Jumlah terlalu kecil untuk satuan dasar bahan.");
    const unitCost = body.unitCost === undefined ? undefined : new Prisma.Decimal(body.unitCost / convertQuantity(1, body.unit, ingredient.unit));
    const totalCost = unitCost ? unitCost.mul(quantity.abs()).toDecimalPlaces(2) : body.totalCost === undefined ? undefined : new Prisma.Decimal(body.totalCost);
    if (body.totalCost !== undefined && totalCost && totalCost.sub(body.totalCost).abs().gt(0.01)) throw fail("Total biaya tidak sesuai jumlah dan biaya satuan.");
    if (body.id || (body.dataSourceId && body.externalId)) {
      const existing = await tx.stockMovement.findFirst({ where: { OR: [
        ...(body.id ? [{ id: body.id }] : []),
        ...(body.dataSourceId && body.externalId ? [{ dataSourceId: body.dataSourceId, externalId: body.externalId }] : []),
      ] } });
      if (existing) {
        if (existing.organizationId !== organizationId || (body.id && existing.id !== body.id) || existing.dataSourceId !== (body.dataSourceId ?? null) || existing.externalId !== (body.externalId ?? null) || existing.stockLocationId !== body.stockLocationId || existing.ingredientId !== body.ingredientId || existing.type !== body.type || !existing.quantity.equals(quantity) || existing.occurredAt.getTime() !== body.occurredAt.getTime() || String(existing.totalCost ?? "") !== String(totalCost ?? "") || existing.reason !== body.reason) throw fail("ID mutasi sudah digunakan dengan isi berbeda. Buat mutasi koreksi baru.", 409);
        return existing;
      }
    }
    const balance = await tx.stockBalance.findUnique({ where: { stockLocationId_ingredientId: { stockLocationId: location.id, ingredientId: ingredient.id } } });
    if (balance && balance.unit !== ingredient.unit) throw fail("Satuan saldo lama berbeda; rekonsiliasi diperlukan.", 409);
    const next = new Prisma.Decimal(balance?.onHandQuantity ?? 0).add(quantity);
    if (next.lt(balance?.reservedQuantity ?? 0)) throw fail("Stok tersedia tidak mencukupi.", 409);
    const averageUnitCost = quantity.gt(0) && unitCost && next.gt(0)
      ? new Prisma.Decimal(balance?.onHandQuantity ?? 0).mul(balance?.averageUnitCost ?? ingredient.currentCost).add(quantity.mul(unitCost)).div(next)
      : balance?.averageUnitCost;
    const movement = await tx.stockMovement.create({ data: { ...body, organizationId, outletId: location.outletId, quantity, unit: ingredient.unit, unitCost, totalCost } });
    await tx.stockBalance.upsert({ where: { stockLocationId_ingredientId: { stockLocationId: location.id, ingredientId: ingredient.id } },
      create: { organizationId, stockLocationId: location.id, ingredientId: ingredient.id, unit: ingredient.unit, onHandQuantity: next, averageUnitCost },
      update: { onHandQuantity: next, averageUnitCost } });
    return movement;
  });
}

export async function repriceRecipes(tx: Prisma.TransactionClient, organizationId: string, productIds: string[]) {
  for (const productId of new Set(productIds)) {
    const recipe = await tx.recipe.findFirst({ where: { organizationId, productId, active: true }, orderBy: { version: "desc" }, include: { items: { include: { ingredient: true } } } });
    if (!recipe) continue;
    let total = new Prisma.Decimal(0);
    for (const item of recipe.items) {
      const cost = item.ingredient.currentCost.mul(convertQuantity(Number(item.quantity), item.unit, item.ingredient.unit));
      total = total.add(cost);
      await tx.recipeItem.update({ where: { id: item.id }, data: { estimatedCost: cost } });
    }
    await tx.product.update({ where: { id: productId, organizationId }, data: { estimatedCost: recipe.items.length ? total.div(recipe.yieldQuantity) : null } });
  }
}
