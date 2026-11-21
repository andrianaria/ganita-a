import { randomBytes as createTestBytes } from "node:crypto";
const testCredential1 = createTestBytes(32).toString("hex");
const testCredential2 = createTestBytes(32).toString("hex");
const testCredential3 = createTestBytes(32).toString("hex");
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "@ganita-ai/database";
import { buildServer } from "./server.js";
import { encodePassword, hashPassword, issueToken } from "./auth.js";

const clerk = vi.hoisted(() => ({ sessions: new Map<string, { userId: string; status: string }>() }));
vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => { const session = clerk.sessions.get(token); if (!session) throw Error("invalid"); return { sub: session.userId, sid: token }; },
  createClerkClient: () => ({ sessions: { getSession: async (id: string) => clerk.sessions.get(id), revokeSession: async (id: string) => { clerk.sessions.get(id)!.status = "revoked"; } },
    users: { getUser: async (id: string) => ({ id, primaryEmailAddress: { emailAddress: `${id}@example.com`, verification: { status: "verified" } } }) } }),
}));

describe("security and ingestion integration", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let org: string, otherOrg: string, outletA: string, outletB: string, otherOutlet: string, owner: string, viewer: string, clerkA: string, clerkB: string, source: string, ingredient: string, location: string;
  let ownerToken: string, viewerToken: string;
  const salesKey = `ganita_live_${randomUUID()}`, inventoryKey = `ganita_live_${randomUUID()}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const row = (code = "A", id = "same-pos-id") => ({ externalId: id, outletCode: code, occurredAt: "2026-09-16T18:00:00Z", grossSales: 100, discountAmount: 10, netSales: 90, totalCost: 40,
    items: [{ productName: "Sushi", productExternalId: "menu-1", quantity: 1, unitPrice: 100, grossAmount: 100, discountAmount: 10, netAmount: 90, totalCost: 40 }] });
  const post = (rows: ReturnType<typeof row>[]) => app.inject({ method: "POST", url: "/v1/imports/transactions", headers: headers(salesKey), payload: { sourceName: "POS", rows } });
  beforeAll(async () => {
    if (process.env.GANITA_TEST_DATABASE !== "1") throw Error("Use pnpm test:integration to run in an isolated database schema.");
    if (!new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("ganita_test_")) throw Error("Isolated schema required");
    process.env.CLERK_SECRET_KEY = testCredential1;
    app = await buildServer();
    org = (await prisma.organization.create({ data: { name: "A", slug: randomUUID() } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: randomUUID() } })).id;
    const brand = await prisma.brand.create({ data: { organizationId: org, name: "A", slug: "a" } });
    const otherBrand = await prisma.brand.create({ data: { organizationId: otherOrg, name: "B", slug: "b" } });
    outletA = (await prisma.outlet.create({ data: { organizationId: org, brandId: brand.id, name: "A", code: "A", timezone: "Asia/Jakarta" } })).id;
    outletB = (await prisma.outlet.create({ data: { organizationId: org, brandId: brand.id, name: "B", code: "B", timezone: "UTC" } })).id;
    otherOutlet = (await prisma.outlet.create({ data: { organizationId: otherOrg, brandId: otherBrand.id, name: "Other", code: "OTHER" } })).id;
    const user = async (role: "OWNER" | "VIEWER", organizationId = org, clerkUserId?: string) => prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: role, clerkUserId, passwordHash: clerkUserId ? hashPassword(clerkUserId) : await encodePassword(testCredential2), memberships: { create: { organizationId, role } } } });
    const o = await user("OWNER"); owner = o.id;
    const v = await user("VIEWER"); viewer = v.id;
    clerkA = (await user("OWNER", org, "clerk-a")).id;
    clerkB = (await user("OWNER", otherOrg, "clerk-b")).id;
    ownerToken = issueToken({ userId: owner, organizationId: org, role: "OWNER", authVersion: 0 }, app.config.JWT_SECRET);
    viewerToken = issueToken({ userId: viewer, organizationId: org, role: "VIEWER", authVersion: 0 }, app.config.JWT_SECRET);
    await prisma.apiKey.createMany({ data: [{ organizationId: org, name: "Sales", keyPrefix: "sales", keyHash: hashPassword(salesKey), scopes: ["sales:write"] }, { organizationId: org, name: "Inventory", keyPrefix: "inventory", keyHash: hashPassword(inventoryKey), scopes: ["inventory:write"] }] });
    ingredient = (await prisma.ingredient.create({ data: { organizationId: otherOrg, name: "Private", unit: "kg", currentCost: 10 } })).id;
    location = (await prisma.stockLocation.create({ data: { organizationId: otherOrg, outletId: otherOutlet, name: "Private", type: "OUTLET" } })).id;
    await prisma.stockBalance.create({ data: { organizationId: otherOrg, ingredientId: ingredient, stockLocationId: location, unit: "kg", onHandQuantity: 7 } });
  }, 20000);
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  it.each([["Asia/Jakarta (GMT+7)", "Asia/Jakarta"], ["Asia/Makassar (GMT+8)", "Asia/Makassar"], ["Asia/Jayapura (GMT+9)", "Asia/Jayapura"]])("repairs legacy timezone %s without touching valid zones", async (label, zone) => {
    const sql = readFileSync(new URL("../../../packages/database/prisma/migrations/20260918120000_normalize_legacy_timezones/migration.sql", import.meta.url), "utf8");
    try {
      await prisma.organization.update({ where: { id: org }, data: { timezone: label } });
      await prisma.outlet.update({ where: { id: outletA }, data: { timezone: label } });
      const before = await app.inject({ url: `/v1/dashboard?outletId=${outletA}`, headers: headers(ownerToken) });
      expect(before.statusCode, before.body).toBe(200);
      expect(before.json().data.timezone).toBe(zone);
      await prisma.$executeRawUnsafe(sql);
      await prisma.$executeRawUnsafe(sql);
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org } })).timezone).toBe(zone);
      expect((await prisma.outlet.findUniqueOrThrow({ where: { id: outletA } })).timezone).toBe(zone);
      expect((await prisma.outlet.findUniqueOrThrow({ where: { id: outletB } })).timezone).toBe("UTC");
      expect((await app.inject({ url: "/v1/dashboard", headers: headers(ownerToken) })).statusCode).toBe(200);
    } finally {
      await prisma.organization.update({ where: { id: org }, data: { timezone: "Asia/Jakarta" } });
      await prisma.outlet.update({ where: { id: outletA }, data: { timezone: "Asia/Jakarta" } });
    }
  });
  it("blocks Clerk ID password bypass", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: clerkA } });
    const result = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: u.email, password: testCredential3 } });
    expect(result.statusCode).toBe(401);
  });
  it("rejects legacy internal JWTs without auth version", async () => {
    const token = issueToken({ userId: owner, organizationId: org, role: "OWNER" }, app.config.JWT_SECRET);
    expect((await app.inject({ url: "/v1/auth/me", headers: headers(token) })).statusCode).toBe(403);
  });
  it("blocks VIEWER mutations and sales-key scope escalation", async () => {
    expect((await app.inject({ method: "PATCH", url: "/v1/organizations/current", headers: headers(viewerToken), payload: { name: "Forbidden" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/ingredients", headers: headers(salesKey), payload: { name: "No", unit: "kg", currentCost: 1 } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/api-keys", headers: headers(salesKey), payload: { name: "Escalation" } })).statusCode).toBe(403);
  });
  it("blocks cross-organization stock updates and recipe references", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/stock-balances", headers: headers(inventoryKey), payload: { ingredientId: ingredient, stockLocationId: location, unit: "kg", onHandQuantity: 999 } })).statusCode).toBe(403);
    expect(Number((await prisma.stockBalance.findFirstOrThrow({ where: { stockLocationId: location } })).onHandQuantity)).toBe(7);
    expect((await app.inject({ method: "POST", url: "/v1/stock-locations", headers: headers(inventoryKey), payload: { outletId: otherOutlet, name: "No", type: "OUTLET" } })).statusCode).toBe(403);
    const product = await prisma.product.create({ data: { organizationId: org, name: "Local product" } });
    expect((await app.inject({ method: "POST", url: "/v1/recipe-items", headers: headers(inventoryKey), payload: { productId: product.id, ingredientId: ingredient, quantity: 1, unit: "kg", estimatedCost: 10 } })).statusCode).toBe(403);
    expect(await prisma.recipeItem.count({ where: { productId: product.id } })).toBe(0);
  });
  it("imports same POS id at two outlets separately, using each timezone", async () => {
    const result = await post([row("A"), row("B")]);
    expect(result.statusCode, result.body).toBe(201);
    source = result.json().data.sourceId;
    expect(result.json().data.created).toBe(2);
    expect(await prisma.transaction.count({ where: { organizationId: org } })).toBe(2);
    const metrics = await prisma.dailyOutletMetric.findMany({ where: { organizationId: org } });
    expect(metrics.find(m => m.outletId === outletA)!.metricDate.toISOString().slice(0, 10)).toBe("2026-09-17");
    expect(metrics.find(m => m.outletId === outletB)!.metricDate.toISOString().slice(0, 10)).toBe("2026-09-16");
  });
  it("replays without duplicates and aggregates all outlets vs one", async () => {
    expect((await post([row("A"), row("B")])).json().data.updated).toBe(2);
    expect(await prisma.transaction.count({ where: { organizationId: org } })).toBe(2);
    const all = await app.inject({ url: "/v1/dashboard?from=2026-09-16&to=2026-09-17", headers: headers(ownerToken) });
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data.summary.netSales).toBe(180);
    expect(all.json().data.summary.cogs).toBe(80);
    expect(all.json().data.summary.netProfit).toBeNull();
    expect(all.json().data.organizationScore).toBeNull();
    const one = await app.inject({ url: `/v1/dashboard?outletId=${outletA}&from=2026-09-16&to=2026-09-17`, headers: headers(ownerToken) });
    expect(one.json().data.summary.netSales).toBe(90);
    expect(one.json().data.outlets).toHaveLength(1);
    expect((await app.inject({ url: `/v1/dashboard?outletId=${otherOutlet}`, headers: headers(ownerToken) })).statusCode).toBe(404);
  });
  it("rolls back the entire batch when a later outlet is invalid", async () => {
    const before = await prisma.transaction.count();
    const result = await post([row("A", "rollback"), row("UNKNOWN", "missing")]);
    expect(result.statusCode).toBe(400);
    expect(await prisma.transaction.count()).toBe(before);
  });
  it("void removes obsolete metrics and replay correction rebuilds them", async () => {
    await post([{ ...row("A"), status: "VOID" } as ReturnType<typeof row>]);
    expect(await prisma.dailyOutletMetric.count({ where: { outletId: outletA } })).toBe(0);
    await post([row("A")]);
    expect(await prisma.dailyOutletMetric.count({ where: { outletId: outletA } })).toBe(1);
  });
  it("missing cost remains unknown rather than zero profit cost", async () => {
    const r = row("A", "missing-cost");
    const result = await app.inject({ method: "POST", url: "/v1/imports/transactions", headers: headers(salesKey), payload: { sourceName: "POS", rows: [{ ...r, totalCost: undefined, items: r.items.map(i => ({ ...i, totalCost: undefined })) }] } });
    expect(result.statusCode).toBe(201);
    const data = (await app.inject({ url: `/v1/dashboard?outletId=${outletA}&from=2026-09-17&to=2026-09-17`, headers: headers(ownerToken) })).json().data;
    expect(data.summary.cogs).toBeNull();
    expect(data.summary.grossProfit).toBeNull();
  });
  it("canonical API uses same transactional ingestion and rejects foreign sources", async () => {
    await prisma.outletDataSource.create({ data: { organizationId: org, outletId: outletA, dataSourceId: source, externalOutletId: "external-A" } });
    const payload = { batch_id: "b1", meta: { source: "POS" }, records: [{ external_id: "canonical", outlet_external_id: "external-A", occurred_at: "2026-09-16T10:00:00Z", gross_sales: 100, net_sales: 100, status: "PAID", items: [{ product_name_snapshot: "Roll", quantity: 1, unit_price: 100, gross_amount: 100, net_amount: 100 }] }] };
    const result = await app.inject({ method: "POST", url: "/v1/integrations/erp/transactions", headers: { ...headers(salesKey), "x-ganita-data-source-id": source }, payload });
    expect(result.statusCode, result.body).toBe(200);
    const otherSource = await prisma.dataSource.create({ data: { organizationId: otherOrg, name: "Other", type: "OTHER" } });
    expect((await app.inject({ method: "POST", url: "/v1/integrations/erp/transactions", headers: { ...headers(salesKey), "x-ganita-data-source-id": otherSource.id }, payload })).statusCode).toBe(403);
  });
  it("Clerk logout revokes session A and account B resolves its own organization", async () => {
    clerk.sessions.set("session-a", { userId: "clerk-a", status: "active" });
    clerk.sessions.set("session-b", { userId: "clerk-b", status: "active" });
    expect((await app.inject({ url: "/v1/auth/me", headers: headers("session-a") })).json().data.organization.id).toBe(org);
    expect((await app.inject({ method: "POST", url: "/v1/auth/logout", headers: headers("session-a") })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/auth/me", headers: headers("session-a") })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/auth/me", headers: headers("session-b") })).json().data.organization.id).toBe(otherOrg);
  });
  it("local logout invalidates all tokens with the prior auth version", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/auth/logout", headers: headers(viewerToken) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/auth/me", headers: headers(viewerToken) })).statusCode).toBe(403);
  });
  it("disabled users cannot use existing tokens", async () => {
    await prisma.user.update({ where: { id: owner }, data: { status: "DISABLED" } });
    expect((await app.inject({ url: "/v1/auth/me", headers: headers(ownerToken) })).statusCode).toBe(403);
  });
});
