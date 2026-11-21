import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@ganita-ai/database";
import { buildServer } from "./server.js";

const clerk = vi.hoisted(() => ({ users: new Map<string, string>() }));
vi.mock("@clerk/backend", () => ({
  verifyToken: async (token: string) => { if (!clerk.users.has(token)) throw Error("Invalid session"); return { sub: clerk.users.get(token), sid: token }; },
  createClerkClient: () => ({ sessions: { getSession: async (id: string) => ({ userId: clerk.users.get(id), status: "active" }) },
    users: { getUser: async (id: string) => ({ primaryEmailAddress: { emailAddress: `${id}@example.com`, verification: { status: "verified" } } }) } }),
}));
describe("onboarding start choices", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const profile = { fullName: "Owner", companyName: "Onboarding test", businessType: "Restoran", timezone: "Asia/Jakarta", currency: "IDR" };
  const manual = { ...profile, outletName: "First Outlet", outletCode: "FIRST", address: "Test Street", city: "Jakarta", country: "Indonesia" };
  const session = () => { const token = randomUUID(); clerk.users.set(token, `user_${randomUUID()}`); return token; };
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const submit = (token: string, payload: object) => app.inject({ method: "POST", url: "/v1/onboarding", headers: auth(token), payload });
  beforeAll(async () => {
    if (process.env.GANITA_TEST_DATABASE !== "1" || !new URL(process.env.DATABASE_URL!).searchParams.get("schema")?.startsWith("ganita_test_")) throw Error("Isolated schema required");
    vi.stubEnv("CLERK_SECRET_KEY", "mocked-development-key");
    app = await buildServer();
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); vi.unstubAllEnvs(); });
  it("creates an authenticated workspace without an outlet and exposes a truly empty dashboard", async () => {
    const token = session();
    const result = await submit(token, { ...manual, mode: "integration" });
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json().data.outlet).toBeNull();
    expect(result.json().data.organization).toMatchObject({ businessType: "Restoran", timezone: "Asia/Jakarta", currency: "IDR" });
    expect((await app.inject({ url: "/v1/auth/me", headers: auth(token) })).statusCode).toBe(200);
    const dashboard = await app.inject({ url: "/v1/dashboard", headers: auth(token) });
    expect(dashboard.statusCode, dashboard.body).toBe(200);
    expect(dashboard.json().data).toMatchObject({ outlets: [], metrics: [], organizationScore: null, summary: { transactionCount: 0, netSales: 0 } });
    expect(await prisma.apiKey.count({ where: { organizationId: result.json().data.organization.id } })).toBe(0);
    const retry = await submit(token, { ...profile, mode: "integration" });
    expect(retry.json().data.organization.id).toBe(result.json().data.organization.id);
    expect(await prisma.outlet.count({ where: { organizationId: result.json().data.organization.id } })).toBe(0);
  });
  it.each([undefined, "manual"])("supports manual mode %s and repeated saves without duplicate outlets", async mode => {
    const token = session();
    const first = await submit(token, { ...manual, ...(mode ? { mode } : {}) });
    expect(first.statusCode, first.body).toBe(201);
    const retry = await submit(token, { ...manual, ...(mode ? { mode } : {}) });
    expect(retry.json().data.outlet.id).toBe(first.json().data.outlet.id);
    expect(first.json().data.outlet).toMatchObject({ address: "Test Street", city: "Jakarta", timezone: "Asia/Jakarta" });
    await submit(token, { ...profile, mode: "integration" });
    expect(await prisma.outlet.count({ where: { organizationId: first.json().data.organization.id } })).toBe(1);
  });
  it.each([{ mode: "manual" }, { mode: "csv" }, { mode: "integration", timezone: "invalid" }])("rejects invalid payload before creating a workspace: %j", async invalid => {
    const token = session();
    expect((await submit(token, { ...profile, ...invalid })).statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { clerkUserId: clerk.users.get(token)! } })).toBeNull();
  });
  it("requires a valid Clerk session for both choices", async () => {
    for (const mode of ["integration", "manual"]) expect((await submit("invalid", { ...manual, mode })).statusCode).toBe(401);
  });
  it("lets the new owner create a named key and receive the first outlet only through sync", async () => {
    const token = session();
    const onboarding = await submit(token, { ...profile, mode: "integration" });
    const org = onboarding.json().data.organization.id;
    const key = await app.inject({ method: "POST", url: "/v1/api-keys", headers: auth(token), payload: { name: "Restaurant ERP" } });
    expect(key.statusCode, key.body).toBe(201);
    expect(await prisma.outlet.count({ where: { organizationId: org } })).toBe(0);
    const payload = { batch_id: randomUUID(), meta: { source: "ERP" }, records: [{ external_id: "external-1", name: "Synced Outlet", code: "SYNC-1" }] };
    for (let i = 0; i < 2; i++) expect((await app.inject({ method: "POST", url: "/v1/integrations/erp/outlets", headers: auth(key.json().data.secret), payload })).statusCode).toBe(200);
    expect(await prisma.outlet.count({ where: { organizationId: org } })).toBe(1);
  });
});
