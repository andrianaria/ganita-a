import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => Object.fromEntries(["brand", "dataSource", "outlet", "product", "ingredient", "recipe", "stockLocation"].map(model => [model, { findFirst: vi.fn() }])));
vi.mock("@ganita-ai/database", () => ({ prisma: db }));
import { assertTenantReferences } from "./tenant";
beforeEach(() => { for (const model of Object.values(db)) model.findFirst.mockReset().mockResolvedValue({ id: "id" }); });
it.each(["brand", "dataSource", "outlet", "product", "ingredient", "recipe", "stockLocation"])("scopes %s lookup and denies unavailable references", async model => {
  await assertTenantReferences("org", { [`${model}Id`]: "id" });
  expect(db[model].findFirst).toHaveBeenCalledWith({ where: { id: "id", organizationId: "org" } });
  db[model].findFirst.mockResolvedValue(null);
  await expect(assertTenantReferences("org", { [`${model}Id`]: "foreign" })).rejects.toMatchObject({ statusCode: 403 });
});
it("ignores omitted references and unrelated fields", async () => {
  await assertTenantReferences("org", { name: "Rice", brandId: undefined });
  for (const model of Object.values(db)) expect(model.findFirst).not.toHaveBeenCalled();
});
it("validates recipe ownership by product even within one tenant", async () => {
  db.recipe.findFirst.mockResolvedValue({ productId: "p1" });
  await expect(assertTenantReferences("org", { recipeId: "r", productId: "p2" })).rejects.toMatchObject({ statusCode: 400 });
  await expect(assertTenantReferences("org", { recipeId: "r", productId: "p1" })).resolves.toBeUndefined();
});
it("validates stock location against its outlet", async () => {
  db.stockLocation.findFirst.mockResolvedValue({ outletId: "o1" });
  await expect(assertTenantReferences("org", { stockLocationId: "s", outletId: "o2" })).rejects.toMatchObject({ statusCode: 400 });
  await expect(assertTenantReferences("org", { stockLocationId: "s", outletId: "o1" })).resolves.toBeUndefined();
  await expect(assertTenantReferences("org", { stockLocationId: "s" })).resolves.toBeUndefined();
});
