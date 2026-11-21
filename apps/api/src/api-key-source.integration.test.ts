import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@ganita-ai/database";
import { buildServer } from "./server.js";
import { encodePassword, hashPassword, issueToken } from "./auth.js";

describe("named API key connections", () => {
  let app: Awaited<ReturnType<typeof buildServer>>, org: string, ownerToken: string, viewerToken: string;
  const auth = (key: string) => ({ authorization: `Bearer ${key}` });
  const create = async (name: string, scopes = ["master:write", "sales:write", "inventory:write"]) => {
    const result = await app.inject({ method: "POST", url: "/v1/api-keys", headers: auth(ownerToken), payload: { name, scopes } });
    expect(result.statusCode, result.body).toBe(201);
    return result.json().data as { id: string; secret: string; dataSourceId: string; name: string };
  };
  const outlets = { batch_id: "outlets-1", meta: { source: "ERP" }, records: [{ external_id: "ext-1", name: "Restaurant A", code: "A" }] };
  const sales = { batch_id: "sales-1", meta: { source: "ERP" }, records: [{ external_id: "sale-1", outlet_external_id: "ext-1", occurred_at: "2026-09-18T08:00:00+07:00", gross_sales: 100, net_sales: 100, total_cost: 40, items: [{ product_name_snapshot: "Lunch", quantity: 1, unit_price: 100, gross_amount: 100, net_amount: 100, total_cost: 40 }] }] };
  beforeAll(async () => {
    if (process.env.GANITA_TEST_DATABASE !== "1" || !new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("ganita_test_")) throw Error("Isolated test database required");
    app = await buildServer();
    org = (await prisma.organization.create({ data: { name: "Named keys", slug: randomUUID() } })).id;
    for (const role of ["OWNER", "VIEWER"] as const) {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: role, passwordHash: await encodePassword(randomUUID()), memberships: { create: { organizationId: org, role } } } });
      const token = issueToken({ userId: user.id, organizationId: org, role, authVersion: 0 }, app.config.JWT_SECRET);
      if (role === "OWNER") ownerToken = token; else viewerToken = token;
    }
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  it("creates a named connection and stores only the secret hash", async () => {
    const key = await create("  Restaurant ERP  ");
    expect(key.name).toBe("Restaurant ERP");
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: key.dataSourceId } });
    expect(source).toMatchObject({ name: "Restaurant ERP", organizationId: org, type: "OTHER", status: "DISCONNECTED" });
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(stored.keyHash).toBe(hashPassword(key.secret));
    const listed = await app.inject({ url: "/v1/api-keys", headers: auth(ownerToken) });
    expect(listed.body).not.toContain(key.secret);
    expect(listed.body).not.toContain(stored.keyHash);
    expect(listed.json().data.find((k: { id: string }) => k.id === key.id).dataSourceId).toBe(source.id);
  });
  it("discovers only the bound source even when an organization has many connections", async () => {
    const key = await create("Another ERP");
    const context = (await app.inject({ url: "/v1/integrations/erp/context", headers: auth(key.secret) })).json().data;
    expect(context.default_data_source_id).toBe(key.dataSourceId);
    expect(context.data_source_header_required).toBe(false);
    expect(context.data_sources.map((s: { id: string }) => s.id)).toEqual([key.dataSourceId]);
    expect((await app.inject({ url: "/v1/data-sources", headers: auth(key.secret) })).json().data).toHaveLength(1);
  });
  it("syncs outlets and transactions with only Bearer auth, replays safely, and separates sources", async () => {
    for (const name of ["POS One", "POS Two"]) {
      const key = await create(name);
      const sync = await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: auth(key.secret), payload: outlets });
      expect(sync.statusCode, sync.body).toBe(200);
      for (let i = 0; i < 2; i++) {
        const result = await app.inject({ method: "POST", url: "/v1/integrations/erp/transactions", headers: auth(key.secret), payload: sales });
        expect(result.statusCode, result.body).toBe(200);
      }
      expect(await prisma.transaction.count({ where: { dataSourceId: key.dataSourceId, externalId: "sale-1" } })).toBe(1);
    }
    expect(await prisma.transaction.count({ where: { organizationId: org, externalId: "sale-1" } })).toBe(2);
  });
  it("rejects header, body, query and URL source overrides, including same-organization sources", async () => {
    const key = await create("Bound ERP"), other = await create("Other ERP");
    const foreignOrg = await prisma.organization.create({ data: { name: "Foreign", slug: randomUUID() } });
    const foreign = await prisma.dataSource.create({ data: { organizationId: foreignOrg.id, name: "Foreign", type: "OTHER" } });
    for (const id of [other.dataSourceId, foreign.id]) {
      const result = await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: { ...auth(key.secret), "x-ganita-data-source-id": id }, payload: outlets });
      expect(result.statusCode).toBe(403);
      expect(result.json().error.code).toBe("DATA_SOURCE_MISMATCH");
    }
    expect((await app.inject({ url: `/v1/data-sources/${other.dataSourceId}/mappings`, headers: auth(key.secret) })).statusCode).toBe(403);
    expect((await app.inject({ url: `/v1/data-sources?dataSourceId=${other.dataSourceId}`, headers: auth(key.secret) })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/ingredients", headers: auth(key.secret), payload: { dataSourceId: other.dataSourceId, name: "Bad", unit: "kg", currentCost: 1 } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/data-sources", headers: auth(key.secret), payload: { name: "Unneeded", type: "OTHER" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: { ...auth(key.secret), "x-ganita-data-source-id": key.dataSourceId }, payload: outlets })).statusCode).toBe(200);
  });
  it("uses the bound source for generic imports without asking for a source name", async () => {
    const key = await create("Import ERP");
    const result = await app.inject({ method: "POST", url: "/v1/imports/transactions", headers: auth(key.secret), payload: { rows: [{ externalId: "generic-1", outletCode: "A", occurredAt: "2026-09-18T10:00:00+07:00", grossSales: 100, netSales: 100, items: [{ productName: "Lunch", quantity: 1, unitPrice: 100, grossAmount: 100, netAmount: 100 }] }] } });
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json().data.sourceId).toBe(key.dataSourceId);
  });
  it("keeps legacy keys compatible without silently reassigning their source", async () => {
    const secret = `ganita_live_${randomUUID()}`;
    await prisma.apiKey.create({ data: { organizationId: org, name: "Legacy", keyPrefix: "legacy", keyHash: hashPassword(secret), scopes: ["master:write", "sales:write"] } });
    const source = await prisma.dataSource.create({ data: { organizationId: org, name: "Legacy source", type: "OTHER" } });
    expect((await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: auth(secret), payload: outlets })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: { ...auth(secret), "x-ganita-data-source-id": source.id }, payload: outlets })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/integrations/erp/context", headers: auth(secret) })).json().data.data_source_header_required).toBe(true);
  });
  it("attributes ingredients and stock movements automatically and applies a replay only once", async () => {
    const key = await create("Inventory ERP");
    const ingredient = await app.inject({ method: "POST", url: "/v1/ingredients", headers: auth(key.secret), payload: { name: "Rice", unit: "kg", currentCost: 10 } });
    expect(ingredient.statusCode, ingredient.body).toBe(201);
    expect(ingredient.json().data.dataSourceId).toBe(key.dataSourceId);
    const outlet = await prisma.outlet.findFirstOrThrow({ where: { organizationId: org, code: "A" } });
    const location = await prisma.stockLocation.create({ data: { organizationId: org, outletId: outlet.id, name: "Kitchen", type: "OUTLET" } });
    const payload = { externalId: "receipt-1", ingredientId: ingredient.json().data.id, stockLocationId: location.id, type: "PURCHASE", quantity: 5, unit: "kg", occurredAt: "2026-09-18T10:00:00+07:00", reason: "Supplier delivery" };
    for (let i = 0; i < 2; i++) {
      const movement = await app.inject({ method: "POST", url: "/v1/stock-movements", headers: auth(key.secret), payload });
      expect(movement.statusCode, movement.body).toBe(201);
      expect(movement.json().data.dataSourceId).toBe(key.dataSourceId);
    }
    expect(Number((await prisma.stockBalance.findFirstOrThrow({ where: { stockLocationId: location.id } })).onHandQuantity)).toBe(5);
  });
  it("does not create orphan sources for invalid names, scopes, or unauthorized users", async () => {
    const before = await prisma.dataSource.count({ where: { organizationId: org } });
    for (const payload of [{ name: " " }, { name: "No scope", scopes: [] }, { name: "Wrong scope", scopes: ["admin:all"] }]) {
      expect((await app.inject({ method: "POST", url: "/v1/api-keys", headers: auth(ownerToken), payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/v1/api-keys", headers: auth(viewerToken), payload: { name: "Forbidden" } })).statusCode).toBe(403);
    expect(await prisma.dataSource.count({ where: { organizationId: org } })).toBe(before);
  });
  it("revokes the key without deleting its connection history", async () => {
    const key = await create("Revoke ERP");
    expect((await app.inject({ method: "POST", url: `/v1/api-keys/${key.id}/revoke`, headers: auth(ownerToken) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/integrations/erp/context", headers: auth(key.secret) })).statusCode).toBe(401);
    expect(await prisma.dataSource.findUnique({ where: { id: key.dataSourceId } })).not.toBeNull();
  });
});
