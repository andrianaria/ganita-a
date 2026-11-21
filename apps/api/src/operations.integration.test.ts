import { randomBytes as createTestBytes } from "node:crypto";
const testCredential1 = createTestBytes(32).toString("hex");
const testCredential2 = createTestBytes(32).toString("hex");
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, businessDate } from "@ganita-ai/database";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { buildServer } from "./server.js";
import { issueToken } from "./auth.js";
const identities = vi.hoisted(() => new Map<string, { email: string; verified: boolean }>());
vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => { if (!identities.has(token)) throw Error("invalid"); return { sub: token, sid: token }; },
  createClerkClient: () => ({ sessions: { getSession: async (id: string) => ({ status: "active", userId: id }) }, users: { getUser: async (id: string) => ({ primaryEmailAddress: { emailAddress: identities.get(id)!.email, verification: { status: identities.get(id)!.verified ? "verified" : "unverified" } } }) } }),
}));
describe("operational workflows against isolated PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof buildServer>>, org: string, foreignOrg: string, outlet: string, foreignOutlet: string, brand: string, owner: string;
  let token: string, managerToken: string, viewerToken: string, source: string, ingredient: string, product: string, location: string;
  let treatment: string, generation: string;
  const date = businessDate(new Date(), "Asia/Jakarta");
  const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: object, session = token) => app.inject({ method, url: `/v1/${url}`, headers: { authorization: `Bearer ${session}` }, payload });
  const ok = async (method: Parameters<typeof call>[0], url: string, payload?: object) => { const r = await call(method, url, payload); expect(r.statusCode, r.body).toBeLessThan(300); return r.json().data; };
  beforeAll(async () => {
    if (process.env.GANITA_TEST_DATABASE !== "1" || !new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("ganita_test_")) throw Error("Run pnpm test:integration");
    process.env.CLERK_SECRET_KEY = testCredential1;
    app = await buildServer();
    org = (await prisma.organization.create({ data: { name: "Operations test", slug: randomUUID() } })).id;
    foreignOrg = (await prisma.organization.create({ data: { name: "Private", slug: randomUUID() } })).id;
    brand = (await prisma.brand.create({ data: { organizationId: org, name: "Test", slug: "test" } })).id;
    const otherBrand = await prisma.brand.create({ data: { organizationId: foreignOrg, name: "Other", slug: "other" } });
    outlet = (await prisma.outlet.create({ data: { organizationId: org, brandId: brand, name: "Main", code: "MAIN" } })).id;
    foreignOutlet = (await prisma.outlet.create({ data: { organizationId: foreignOrg, brandId: otherBrand.id, name: "Private", code: "OTHER" } })).id;
    for (const role of ["OWNER", "MANAGER", "VIEWER"] as const) {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: role, passwordHash: "disabled-test-password", memberships: { create: { organizationId: org, role } } } });
      const value = issueToken({ userId: user.id, organizationId: org, role, authVersion: 0 }, app.config.JWT_SECRET);
      if (role === "OWNER") { owner = user.id; token = value; } else if (role === "MANAGER") managerToken = value; else viewerToken = value;
    }
  });
  afterAll(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await app?.close(); await prisma.$disconnect(); });
  it("persists settings and rejects empty, out-of-range, and invalid timezones", async () => {
    const payload = { name: "Updated", businessType: "Kafe", timezone: "Asia/Makassar", settings: { targets: { foodCost: "30", margin: "50", waste: "3", stockDays: "5" } } };
    await ok("PATCH", "organizations/current", payload);
    expect(await ok("GET", "organizations/current")).toMatchObject(payload);
    for (const value of ["", "NaN", "-1", "101"]) expect((await call("PATCH", "organizations/current", { settings: { targets: { ...payload.settings.targets, foodCost: value } } })).statusCode).toBe(400);
    expect((await call("PATCH", "organizations/current", { timezone: "Not/AZone" })).statusCode).toBe(400);
    await ok("PATCH", "organizations/current", { settings: { notifications: { health: false, stock: true, sales: true } } });
    expect((await ok("GET", "organizations/current")).settings.targets.foodCost).toBe("30");
  });
  it("creates and updates full outlet location; prevents cross-tenant edits", async () => {
    const row = await ok("POST", "outlets", { brandId: brand, name: "Branch", code: "BRANCH", address: "Jl. Melati 12", city: "Bogor", country: "Indonesia", timezone: "Asia/Jakarta" });
    expect(row).toMatchObject({ address: "Jl. Melati 12", city: "Bogor", country: "Indonesia" });
    await ok("PATCH", `outlets/${row.id}`, { city: "Jakarta" });
    expect((await ok("GET", `outlets/${row.id}`)).city).toBe("Jakarta");
    expect((await call("PATCH", `outlets/${foreignOutlet}`, { name: "Bad" })).statusCode).toBe(404);
    expect((await call("POST", "outlets", { brandId: brand, name: "Duplicate", code: "BRANCH" })).statusCode).toBe(409);
  });
  it("persists onboarding business type and complete first-outlet address", async () => {
    const session = `clerk-${randomUUID()}`; identities.set(session, { email: `${session}@example.com`, verified: true });
    const payload = { fullName: "New owner", companyName: "New restaurant", businessType: "Toko roti", outletName: "First", outletCode: "FIRST", address: "Jalan Anggrek 1", city: "Bandung", country: "Indonesia", timezone: "Asia/Jakarta", currency: "IDR" };
    const rejected = await call("POST", "onboarding", { ...payload, timezone: "Asia/Jakarta (GMT+7)" }, session);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.details.issues).toContainEqual(expect.objectContaining({ path: ["timezone"] }));
    expect(await prisma.user.findUnique({ where: { clerkUserId: session } })).toBeNull();
    const result = await call("POST", "onboarding", payload, session);
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json().data.organization.businessType).toBe("Toko roti");
    expect(result.json().data.outlet).toMatchObject({ address: "Jalan Anggrek 1", city: "Bandung", country: "Indonesia" });
    expect((await prisma.outlet.findUniqueOrThrow({ where: { id: result.json().data.outlet.id } })).timezone).toBe("Asia/Jakarta");
    expect((await call("POST", "onboarding", payload, session)).statusCode).toBe(201);
    expect(await prisma.outlet.count({ where: { organizationId: result.json().data.organization.id } })).toBe(1);
  });
  it("invites only a verified matching Clerk identity and rejects replay", async () => {
    const email = `${randomUUID()}@example.com`, session = `invite-${randomUUID()}`;
    const invitation = await ok("POST", "team/invitations", { email, role: "MANAGER" });
    const inviteToken = new URL(invitation.url).hash.slice(1);
    identities.set(session, { email: "wrong@example.com", verified: true });
    expect((await call("POST", "team/accept", { token: inviteToken }, session)).statusCode).toBe(403);
    identities.set(session, { email, verified: false });
    expect((await call("POST", "team/accept", { token: inviteToken }, session)).statusCode).toBe(401);
    identities.set(session, { email, verified: true });
    expect((await call("POST", "team/accept", { token: inviteToken }, session)).statusCode).toBe(200);
    expect((await call("POST", "team/accept", { token: inviteToken }, session)).statusCode).toBe(403);
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: session }, include: { memberships: true } });
    expect(user.memberships).toEqual([expect.objectContaining({ organizationId: org, role: "MANAGER" })]);
    expect((await call("POST", "team/invitations", { email, role: "VIEWER" }, managerToken)).statusCode).toBe(403);
    expect((await call("PATCH", `team/members/${owner}`, { role: "VIEWER" })).statusCode).toBe(409);
  });
  it("revokes and expires invitations", async () => {
    const session = `expired-${randomUUID()}`, email = `${session}@example.com`; identities.set(session, { email, verified: true });
    const first = await ok("POST", "team/invitations", { email, role: "VIEWER" });
    await ok("DELETE", `team/invitations/${first.id}`);
    expect((await call("POST", "team/accept", { token: new URL(first.url).hash.slice(1) }, session)).statusCode).toBe(403);
    const second = await ok("POST", "team/invitations", { email, role: "VIEWER" });
    await prisma.teamInvitation.update({ where: { id: second.id }, data: { expiresAt: new Date(0) } });
    expect((await call("POST", "team/accept", { token: new URL(second.url).hash.slice(1) }, session)).statusCode).toBe(403);
  });
  it("does not claim an unconfigured source is connected; maps only local outlets", async () => {
    const row = await ok("POST", "data-sources", { name: "General ERP", type: "OTHER" }); source = row.id;
    expect(row.status).toBe("DISCONNECTED");
    expect((await ok("POST", `data-sources/${source}/test`)).ok).toBe(false);
    expect((await call("POST", `data-sources/${source}/sync`, {})).statusCode).toBe(409);
    await ok("POST", `data-sources/${source}/mappings`, { outletId: outlet, externalOutletId: "external-main" });
    expect((await ok("GET", `data-sources/${source}/mappings`))[0].outlet.id).toBe(outlet);
    expect((await call("POST", `data-sources/${source}/mappings`, { outletId: foreignOutlet, externalOutletId: "bad" })).statusCode).toBe(403);
  });
  it("creates menus and recipes, converts grams to kilograms, recalculates after ingredient edits", async () => {
    ingredient = (await ok("POST", "ingredients", { name: "Salmon", unit: "kg", currentCost: 60000 })).id;
    product = (await ok("POST", "products", { name: "Salmon Roll", sellingPrice: 25000, brandId: brand })).id;
    const recipe = await ok("PUT", `products/${product}/recipe`, { name: "Roll", yieldQuantity: 2, items: [{ ingredientId: ingredient, quantity: 100, unit: "g" }] });
    expect(Number(recipe.product.estimatedCost)).toBe(3000);
    await ok("PATCH", `ingredients/${ingredient}`, { currentCost: 80000 });
    expect(Number((await ok("GET", "products")).find((p: { id: string }) => p.id === product).estimatedCost)).toBe(4000);
    await ok("PUT", `products/${product}/recipe`, { name: "Roll v2", yieldQuantity: 1, items: [{ ingredientId: ingredient, quantity: 80, unit: "g" }] });
    expect(await prisma.recipe.count({ where: { productId: product, active: true } })).toBe(1);
    expect((await call("PUT", `products/${product}/recipe`, { name: "Invalid", yieldQuantity: 1, items: [{ ingredientId: ingredient, quantity: 1, unit: "ml" }] })).statusCode).toBe(400);
    expect(await prisma.recipe.count({ where: { productId: product, active: true } })).toBe(1);
  });
  it("archives products without deleting recipe history", async () => {
    await ok("DELETE", `products/${product}`); expect((await prisma.product.findUniqueOrThrow({ where: { id: product } })).active).toBe(false);
    await ok("PATCH", `products/${product}`, { active: true }); expect(await prisma.recipe.count({ where: { productId: product } })).toBe(2);
  });
  it("applies stock movements once, converts units, and rejects conflicting replay", async () => {
    location = (await ok("POST", "stock-locations", { name: "Main kitchen", outletId: outlet, type: "OUTLET" })).id;
    const body = { stockLocationId: location, ingredientId: ingredient, dataSourceId: source, externalId: "purchase-1", type: "PURCHASE", occurredAt: new Date().toISOString(), quantity: 2000, unit: "g", unitCost: 80, reason: "Invoice test" };
    const first = await ok("POST", "stock-movements", body); const replay = await ok("POST", "stock-movements", body);
    expect(replay.id).toBe(first.id); expect(Number(first.quantity)).toBe(2); expect(Number(first.unitCost)).toBe(80000);
    expect((await call("POST", "stock-movements", { ...body, quantity: 3000 })).statusCode).toBe(409);
    expect(Number((await ok("GET", "stock-balances"))[0].onHandQuantity)).toBe(2);
    expect((await call("POST", "stock-movements", { ...body, externalId: "waste-too-big", type: "WASTE", quantity: 3000 })).statusCode).toBe(409);
    expect(await prisma.stockMovement.count({ where: { organizationId: org } })).toBe(1);
  });
  it("serializes simultaneous stock withdrawals and reconciles with an adjustment ledger", async () => {
    const body = { stockLocationId: location, ingredientId: ingredient, type: "SALE_USAGE", occurredAt: new Date().toISOString(), quantity: 1.5, unit: "kg", reason: "Consumption" };
    const first = call("POST", "stock-movements", body), second = call("POST", "stock-movements", body);
    const statuses = [(await first).statusCode, (await second).statusCode].sort(); expect(statuses).toEqual([201, 409]);
    await ok("POST", "stock-balances", { stockLocationId: location, ingredientId: ingredient, unit: "kg", onHandQuantity: 5 });
    const adjustment = await prisma.stockMovement.findFirstOrThrow({ where: { organizationId: org, type: "ADJUSTMENT" } }); expect(Number(adjustment.quantity)).toBe(4.5);
    expect(Number((await ok("GET", "stock-balances"))[0].onHandQuantity)).toBe(5);
  });
  it("rebuilds metrics from expenses and uses saved targets in actual health diagnoses", async () => {
    await ok("POST", "imports/transactions", { sourceName: "Metrics test", rows: [{ externalId: "order", outletCode: "MAIN", occurredAt: new Date().toISOString(), grossSales: 100000, netSales: 100000, totalCost: 40000, items: [{ productName: "Roll", quantity: 1, unitPrice: 100000, grossAmount: 100000, netAmount: 100000, totalCost: 40000 }] }] });
    const body = { id: randomUUID(), outletId: outlet, expenseDate: date, amount: 20000, category: "OTHER", description: "Daily expense" };
    const first = await ok("POST", "expenses", body); const replay = await ok("POST", "expenses", body); expect(replay.id).toBe(first.id);
    const data = await ok("GET", `dashboard?outletId=${outlet}`);
    expect(data.summary.netProfit).toBe(40000);
    expect(data.outlets[0].health.issues).toContainEqual(expect.objectContaining({ type: "HIGH_HPP", targetValue: 30 }));
    expect(data.outlets[0].health.issues).toContainEqual(expect.objectContaining({ metricName: "net_margin_percentage", targetValue: 50 }));
  });
  it("deduplicates manual stock requests and rejects changed payloads", async () => {
    const body = { id: randomUUID(), stockLocationId: location, ingredientId: ingredient, type: "PURCHASE", occurredAt: new Date().toISOString(), quantity: 1, unit: "kg", reason: "Manual receipt" };
    const before = Number((await ok("GET", "stock-balances"))[0].onHandQuantity);
    const first = await ok("POST", "stock-movements", body);
    expect((await ok("POST", "stock-movements", body)).id).toBe(first.id);
    expect(Number((await ok("GET", "stock-balances"))[0].onHandQuantity)).toBe(before + 1);
    expect((await call("POST", "stock-movements", { ...body, quantity: 2 })).statusCode).toBe(409);
  });
  it("keeps legacy recipe endpoints costed and prevents manual HPP overrides", async () => {
    const item = await ok("POST", "products", { name: "Legacy recipe test", sellingPrice: 20000 });
    const line = await ok("POST", "recipe-items", { productId: item.id, ingredientId: ingredient, quantity: 100, unit: "g" });
    expect(line.recipeId).toBeTruthy();
    expect(Number((await ok("PATCH", `products/${item.id}`, { estimatedCost: 1 })).estimatedCost)).toBe(8000);
    const recipe = await ok("POST", "recipes", { productId: item.id, version: 2, name: "New version" });
    expect(await prisma.recipe.count({ where: { productId: item.id, active: true } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).estimatedCost).toBeNull();
    await ok("POST", "recipe-items", { productId: item.id, recipeId: recipe.id, ingredientId: ingredient, quantity: 50, unit: "g" });
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).estimatedCost)).toBe(4000);
  });
  it("persists real inspection evidence and tenant-scoped treatment outcomes", async () => {
    const inspection = await ok("POST", "inspections", { outletId: outlet });
    expect(inspection.result.summary.netSales).toBe(100000); expect(inspection.result.outlets).toHaveLength(1);
    expect((await ok("GET", `inspections?outletId=${outlet}`))[0].id).toBe(inspection.id);
    expect((await call("POST", "inspections", { outletId: foreignOutlet })).statusCode).toBe(404);
    treatment = (await ok("POST", "treatments", { outletId: outlet, title: "Review supplier quotation" })).id;
    const result = await ok("PATCH", `treatments/${treatment}`, { status: "COMPLETED", resultNote: "Quotation received; no cost change yet." });
    expect(result.outcome.summary.netProfit).toBe(40000); expect(result.completedAt).toBeTruthy();
    expect((await call("PATCH", `treatments/${treatment}`, { status: "IN_PROGRESS", resultNote: "Reopen" })).statusCode).toBe(409);
  });
  it("exports real valid PDF and Excel with scoped sales amounts", async () => {
    const xlsx = await call("GET", `reports/export?format=xlsx&outletId=${outlet}&language=id`);
    expect(xlsx.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.rawPayload as never);
    expect(workbook.worksheets[0].getCell("B4").value).toBe(100000);
    const pdf = await call("GET", `reports/export?format=pdf&outletId=${outlet}`);
    expect(pdf.statusCode).toBe(200); expect((await PDFDocument.load(pdf.rawPayload)).getPageCount()).toBeGreaterThan(0);
    expect((await call("GET", `reports/export?format=pdf&outletId=${foreignOutlet}`)).statusCode).toBe(404);
  });
  it("blocks read-only users from operational mutations", async () => {
    for (const path of ["products", "ingredients", "inspections", "expenses", "team/invitations", "treatments"]) expect((await call("POST", path, {}, viewerToken)).statusCode).toBe(403);
  });
  it("does not fabricate chat responses without a configured provider", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    expect((await call("POST", "assistant", { id: randomUUID(), prompt: "Analyze sales", outletId: outlet })).statusCode).toBe(503);
  });
  it("persists scoped provider answers, tracks usage, and deduplicates requests", async () => {
    vi.stubEnv("LLM_PROVIDER", "remote"); vi.stubEnv("ASSISTANT_API_KEY", testCredential2); vi.stubEnv("ASSISTANT_MODEL", "test-model"); vi.stubEnv("ASSISTANT_API_URL", "https://example.com/assistant");
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Sales total 100000; review food costs." }] }], usage: { input_tokens: 100, output_tokens: 20 } })); vi.stubGlobal("fetch", fetch);
    generation = randomUUID(); const body = { id: generation, outletId: outlet, prompt: "Analyze sales", language: "en" };
    const result = await ok("POST", "assistant", body); expect(result.status).toBe("COMPLETED"); expect(result.usage.input_tokens).toBe(100);
    await ok("POST", "assistant", body); expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetch.mock.calls[0][1].body); expect(payload.store).toBe(false); expect(JSON.parse(payload.input).evidence.outlets).toHaveLength(1);
    expect((await call("POST", "assistant", body, managerToken)).statusCode).toBe(409);
    expect((await call("GET", `assistant?outletId=${outlet}`, undefined, managerToken)).json().data).toEqual([]);
  });
});
