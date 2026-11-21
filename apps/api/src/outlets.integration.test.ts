import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@ganita-ai/database";
import { buildServer } from "./server.js";
import { issueToken } from "./auth.js";

describe("outlet management and explicit mapping", () => {
  let app: Awaited<ReturnType<typeof buildServer>>, org: string, brand: string, token: string, viewer: string, manager: string, key: string, source: string, target: string, foreignOutlet: string;
  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, payload?: object, auth = token) => app.inject({ method, url: `/v1/${path}`, payload, headers: { authorization: `Bearer ${auth}` } });
  const ok = async (method: Parameters<typeof call>[0], path: string, payload?: object, auth = token) => { const r = await call(method, path, payload, auth); expect(r.statusCode, r.body).toBeLessThan(300); return r.json().data; };
  const create = (code: string) => ok("POST", "outlets", { brandId: brand, name: code, code });
  const batch = (records: object[]) => ({ batch_id: randomUUID(), resource: "outlets", records, meta: { source: "Restaurant ERP" } });
  const records = [151, 153, 156].map(id => ({ external_id: String(id), name: `Branch ${id}`, code: `OUTLET-${id}`, address: { line1: "Jalan Sumber", city: "Jakarta", country: "ID" } }));
  beforeAll(async () => {
    if (process.env.GANITA_TEST_DATABASE !== "1" || !new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("ganita_test_")) throw Error("Isolated database required");
    app = await buildServer();
    org = (await prisma.organization.create({ data: { name: "Outlet tests", slug: randomUUID() } })).id;
    brand = (await prisma.brand.create({ data: { organizationId: org, name: "Test", slug: "test" } })).id;
    for (const role of ["OWNER", "MANAGER", "VIEWER"] as const) {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.com`, name: role, passwordHash: "disabled", memberships: { create: { organizationId: org, role } } } });
      const session = issueToken({ userId: user.id, organizationId: org, role, authVersion: 0 }, app.config.JWT_SECRET);
      if (role === "OWNER") token = session; else if (role === "VIEWER") viewer = session; else manager = session;
    }
    const other = await prisma.organization.create({ data: { name: "Other", slug: randomUUID(), brands: { create: { name: "Other", slug: "other" } } }, include: { brands: true } });
    foreignOutlet = (await prisma.outlet.create({ data: { organizationId: other.id, brandId: other.brands[0].id, name: "Private", code: "PRIVATE" } })).id;
    const connection = await ok("POST", "api-keys", { name: "Restaurant ERP" }); key = connection.secret; source = connection.dataSourceId;
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });
  it("persists contact, notes, timezone and a full weekly schedule", async () => {
    const openingHours = Array.from({ length: 7 }, (_, day) => ({ day, mode: day === 6 ? "closed" : "open", open: "10:00", close: "02:00" }));
    const row = await create("DEMO-B"); target = row.id;
    await ok("PATCH", `outlets/${target}`, { name: "Demo Outlet B", phone: "555-0199", email: "outlet@example.com", notes: "Lantai 2", address: "Demo Street", timezone: "Asia/Jakarta", openingHours });
    expect(await ok("GET", `outlets/${target}`)).toMatchObject({ phone: "555-0199", notes: "Lantai 2", openingHours, profileManagedLocally: true });
    expect((await call("PATCH", `outlets/${target}`, { openingHours: [{ day: 0, mode: "open", open: "99:00", close: "20:00" }] })).statusCode).toBe(400);
    expect((await call("PATCH", `outlets/${target}`, { notes: "bad" }, viewer)).statusCode).toBe(403);
  });
  it("reduces four outlets to three by moving an empty imported outlet mapping, preserving the local profile on replay", async () => {
    await ok("POST", "integrations/erp/outlets", batch(records), key);
    const rows = await ok("GET", "outlets"); expect(rows).toHaveLength(4);
    const imported = rows.find((o: { code: string }) => o.code === "OUTLET-151");
    expect(imported).toMatchObject({ address: "Jalan Sumber", city: "Jakarta" });
    expect(imported.dataSourceLinks[0].dataSource.name).toBe("Restaurant ERP");
    await ok("PATCH", `data-sources/${source}/mappings`, { externalOutletId: "151", previousOutletId: imported.id, outletId: target, deleteEmptyOutlet: true });
    expect(await ok("GET", "outlets")).toHaveLength(3);
    expect(await prisma.outlet.findUnique({ where: { id: imported.id } })).toBeNull();
    const replay = await ok("POST", "integrations/erp/outlets", batch(records), key); expect(replay.created).toBe(0);
    expect(await ok("GET", `outlets/${target}`)).toMatchObject({ name: "Demo Outlet B", code: "DEMO-B", address: "Demo Street", phone: "555-0199" });
    await ok("POST", `data-sources/${source}/sync-outlets`, { outlets: [{ externalId: "151", code: "OUTLET-151", name: "ERP rename" }] }, key);
    expect((await ok("GET", `outlets/${target}`)).name).toBe("Demo Outlet B");
  });
  it("routes subsequent sales to the mapped outlet and blocks remapping history", async () => {
    const sales = { batch_id: randomUUID(), records: [{ external_id: "ORDER-1", outlet_external_id: "151", occurred_at: new Date().toISOString(), gross_sales: 100, net_sales: 100, items: [{ product_name_snapshot: "Roll", quantity: 1, unit_price: 100, gross_amount: 100, net_amount: 100 }] }], meta: { source: "ERP" } };
    await ok("POST", "integrations/erp/transactions", sales, key);
    await ok("POST", "integrations/erp/transactions", sales, key);
    expect(await prisma.transaction.count({ where: { outletId: target } })).toBe(1);
    const next = await create("NEXT");
    expect((await call("PATCH", `data-sources/${source}/mappings`, { externalOutletId: "151", previousOutletId: target, outletId: next.id, deleteEmptyOutlet: true })).statusCode).toBe(409);
    expect((await call("DELETE", `outlets/${target}`)).statusCode).toBe(409);
    await ok("PATCH", `outlets/${target}`, { status: "INACTIVE" });
    await ok("POST", "integrations/erp/outlets", batch(records), key);
    expect((await ok("GET", `outlets/${target}`)).status).toBe("INACTIVE");
    await ok("PATCH", `outlets/${target}`, { status: "ACTIVE" });
  });
  it("rejects foreign targets, stale mappings, source collisions and unauthorized destructive operations", async () => {
    const links = await ok("GET", `data-sources/${source}/mappings`), from = links.find((m: { externalOutletId: string }) => m.externalOutletId === "153");
    const payload = { externalOutletId: "153", previousOutletId: from.outletId, outletId: target };
    expect((await call("PATCH", `data-sources/${source}/mappings`, { ...payload, outletId: foreignOutlet })).statusCode).toBe(403);
    expect((await call("PATCH", `data-sources/${source}/mappings`, { ...payload, previousOutletId: randomUUID() })).statusCode).toBe(409);
    expect((await call("PATCH", `data-sources/${source}/mappings`, payload)).statusCode).toBe(409);
    for (const auth of [viewer, manager, key]) {
      expect((await call("PATCH", `data-sources/${source}/mappings`, payload, auth)).statusCode).toBe(403);
      expect((await call("DELETE", `outlets/${from.outletId}`, undefined, auth)).statusCode).toBe(403);
    }
    expect((await call("DELETE", `outlets/${foreignOutlet}`)).statusCode).toBe(404);
    expect((await call("DELETE", `outlets/${from.outletId}`)).statusCode).toBe(409);
    expect((await call("POST", `data-sources/${source}/mappings`, { externalOutletId: "new", outletId: target })).statusCode).toBe(409);
    expect((await call("POST", "integrations/erp/outlets", batch([{ external_id: "wrong-id", name: "Conflicting branch", code: "DEMO-B" }]), key)).statusCode).toBe(409);
    expect((await call("POST", `data-sources/${source}/sync-outlets`, { outlets: [{ externalId: "wrong-id", name: "Conflicting branch", code: "DEMO-B" }] }, key)).statusCode).toBe(409);
  });
  it("deletes empty unlinked outlets and protects inventory and inspection records", async () => {
    const empty = await create("EMPTY"); await ok("DELETE", `outlets/${empty.id}`);
    expect((await call("DELETE", `outlets/${empty.id}`)).statusCode).toBe(404);
    const stocked = await create("STOCKED");
    await prisma.stockLocation.create({ data: { organizationId: org, outletId: stocked.id, name: "Kitchen", type: "OUTLET" } });
    expect((await call("DELETE", `outlets/${stocked.id}`)).statusCode).toBe(409);
    const inspected = await create("INSPECTED");
    await prisma.inspection.create({ data: { organizationId: org, outletId: inspected.id, result: {} } });
    expect((await call("DELETE", `outlets/${inspected.id}`)).statusCode).toBe(409);
  });
  it("rolls back mapping changes when another connection prevents deleting the original outlet", async () => {
    const links = await ok("GET", `data-sources/${source}/mappings`), from = links.find((m: { externalOutletId: string }) => m.externalOutletId === "156");
    const second = await ok("POST", "api-keys", { name: "Second ERP" });
    await ok("POST", `data-sources/${second.dataSourceId}/mappings`, { externalOutletId: "other", outletId: from.outletId });
    const to = await create("DESTINATION");
    const payload = { externalOutletId: "156", previousOutletId: from.outletId, outletId: to.id, deleteEmptyOutlet: true };
    expect((await call("PATCH", `data-sources/${source}/mappings`, payload)).statusCode).toBe(409);
    expect((await ok("GET", `data-sources/${source}/mappings`)).find((m: { externalOutletId: string }) => m.externalOutletId === "156").outletId).toBe(from.outletId);
    await ok("PATCH", `data-sources/${source}/mappings`, { ...payload, deleteEmptyOutlet: false });
    expect(await prisma.outlet.findUnique({ where: { id: from.outletId } })).not.toBeNull();
  });
});
