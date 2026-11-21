import { prisma } from "@ganita-ai/database";

export async function assertTenantReferences(organizationId: string, refs: Record<string, unknown>) {
  const lookup = {
    brandId: (id: string) => prisma.brand.findFirst({ where: { id, organizationId } }),
    dataSourceId: (id: string) => prisma.dataSource.findFirst({ where: { id, organizationId } }),
    outletId: (id: string) => prisma.outlet.findFirst({ where: { id, organizationId } }),
    productId: (id: string) => prisma.product.findFirst({ where: { id, organizationId } }),
    ingredientId: (id: string) => prisma.ingredient.findFirst({ where: { id, organizationId } }),
    recipeId: (id: string) => prisma.recipe.findFirst({ where: { id, organizationId } }),
    stockLocationId: (id: string) => prisma.stockLocation.findFirst({ where: { id, organizationId } }),
  };
  for (const key of Object.keys(lookup) as Array<keyof typeof lookup>) {
    if (typeof refs[key] !== "string") continue;
    const row = await lookup[key](refs[key] as string);
    if (!row) throw Object.assign(new Error(`Referensi ${key} tidak tersedia di organisasi ini.`), { statusCode: 403 });
    if (key === "recipeId" && "productId" in row && row.productId !== refs.productId) throw Object.assign(new Error("Resep tidak sesuai dengan produk."), { statusCode: 400 });
    if (key === "stockLocationId" && "outletId" in row && refs.outletId && row.outletId !== refs.outletId) throw Object.assign(new Error("Lokasi stok tidak sesuai dengan outlet."), { statusCode: 400 });
  }
}
