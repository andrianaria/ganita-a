import { randomBytes as createTestBytes } from "node:crypto";
const testCredential1 = createTestBytes(32).toString("hex");
const testCredential2 = createTestBytes(32).toString("hex");
const testCredential3 = createTestBytes(32).toString("hex");
const testCredential4 = createTestBytes(32).toString("hex");
const testCredential5 = createTestBytes(32).toString("hex");
import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
const mocks = vi.hoisted(() => ({ key: vi.fn(), touchKey: vi.fn(), membership: vi.fn(), user: vi.fn(), verify: vi.fn(), session: vi.fn(), clerkUser: vi.fn() }));
vi.mock("@ganita-ai/database", () => ({ prisma: { apiKey: { findUnique: mocks.key, update: mocks.touchKey }, organizationUser: { findUnique: mocks.membership }, user: { findUnique: mocks.user } } }));
vi.mock("@clerk/backend", () => ({ verifyToken: mocks.verify, createClerkClient: () => ({ sessions: { getSession: mocks.session }, users: { getUser: mocks.clerkUser } }) }));
import { accessError, encodePassword, getClerkIdentity, hashPassword, issueToken, requireAuth, requireScope, verifyPassword, type AuthenticatedUser } from "./auth";

const testApiKey = `ganita_live_${createTestBytes(24).toString("hex")}`;
const secret = testCredential1;
const identity: AuthenticatedUser = { userId: "u", organizationId: "org", role: "OWNER", authVersion: 2 };
function request(token?: string, method = "GET", path = "/v1/auth/me") {
  return { headers: token ? { authorization: `Bearer ${token}` } : {}, method, routeOptions: { url: path }, url: path, server: { config: { JWT_SECRET: secret } } } as unknown as FastifyRequest;
}
function reply() {
  const r = { sent: false, code: vi.fn(), send: vi.fn() };
  r.code.mockReturnValue(r); r.send.mockImplementation(() => { r.sent = true; return r; });
  return r;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLERK_SECRET_KEY", "unit-only-clerk-mock");
  mocks.membership.mockResolvedValue({ role: "VIEWER", user: { status: "ACTIVE", clerkUserId: null, authVersion: 2 } });
  mocks.verify.mockResolvedValue({ sub: "clerk-a", sid: "session-a" });
  mocks.session.mockResolvedValue({ status: "active", userId: "clerk-a" });
  mocks.clerkUser.mockResolvedValue({ firstName: "Demo", lastName: "Tester", primaryEmailAddress: { emailAddress: "demo@example.com", verification: { status: "verified" } } });
  mocks.user.mockResolvedValue({ id: "u", status: "ACTIVE", memberships: [{ organizationId: "org", role: "OWNER" }] });
});

describe("passwords and JWTs", () => {
  it("uses independently salted scrypt hashes", async () => {
    const first = await encodePassword(testCredential2);
    expect(first).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(first).not.toBe(await encodePassword(testCredential2));
    expect(await verifyPassword(testCredential2, first)).toBe(true);
    expect(await verifyPassword(testCredential3, first)).toBe(false);
  });
  it("verifies legacy hashes only on an exact match", async () => {
    expect(await verifyPassword(testCredential4, hashPassword(testCredential4))).toBe(true);
    expect(await verifyPassword(testCredential3, hashPassword(testCredential4))).toBe(false);
  });
  it.each(["", "bad", "scrypt::abcd", "scrypt:salt:short", "other:salt:hash"])("rejects malformed hash %j", async hash => expect(await verifyPassword(testCredential5, hash)).toBe(false));
  it("issues signed, unique, versioned tokens expiring after 12 hours", () => {
    const a = issueToken(identity, secret), b = issueToken(identity, secret);
    const decoded = jwt.verify(a, secret) as jwt.JwtPayload;
    expect(decoded).toMatchObject(identity); expect(decoded.exp! - decoded.iat!).toBe(43200);
    expect(a).not.toBe(b); expect(() => jwt.verify(a, "wrong-secret")).toThrow();
  });
});
describe("role and API-key scope policy", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects viewer %s", method => expect(accessError({ ...identity, role: "VIEWER" }, method, "/v1/ingredients")).toBeTruthy());
  it.each(["GET", "HEAD", "OPTIONS"])("permits viewer %s", method => expect(accessError({ ...identity, role: "VIEWER" }, method, "/v1/ingredients")).toBeNull());
  it("allows viewer logout", () => expect(accessError({ ...identity, role: "VIEWER" }, "POST", "/v1/auth/logout")).toBeNull());
  it.each(["/v1/organizations/current", "/v1/api-keys", "/v1/data-sources"])("restricts %s to owner/admin", path => {
    expect(accessError({ ...identity, role: "MANAGER" }, "POST", path)).toBeTruthy();
    for (const role of ["OWNER", "ADMIN"] as const) expect(accessError({ ...identity, role }, "POST", path)).toBeNull();
  });
  it("permits manager operational updates", () => expect(accessError({ ...identity, role: "MANAGER" }, "POST", "/v1/stock-balances")).toBeNull());
  it.each([
    ["/v1/imports/transactions", "sales:write"], ["/v1/integrations/erp/transactions", "sales:write"],
    ["/v1/ingredients", "inventory:write"], ["/v1/recipes", "inventory:write"], ["/v1/recipe-items", "inventory:write"], ["/v1/stock-balances", "inventory:write"], ["/v1/stock-movements", "inventory:write"], ["/v1/suppliers", "inventory:write"],
    ["/v1/outlets", "master:write"], ["/v1/products", "master:write"], ["/v1/brands", "master:write"], ["/v1/data-sources", "master:write"], ["/v1/integrations/erp/context", "master:write"],
  ])("requires explicit scope for %s", (path, scope) => {
    expect(accessError({ ...identity, apiKeyScopes: [scope] }, "POST", path)).toBeNull();
    expect(accessError({ ...identity, apiKeyScopes: [] }, "POST", path)).toBeTruthy();
  });
  it.each(["/v1/api-keys", "/v1/auth/logout", "/v1/organizations/current", "/v1/unknown"])("does not give API keys implicit access to %s", path => expect(accessError({ ...identity, apiKeyScopes: ["sales:write", "inventory:write", "master:write"] }, "POST", path)).toBeTruthy());
});
describe("Clerk identity validation", () => {
  it("maps a verified active identity", async () => expect(await getClerkIdentity(request("clerk-token"))).toEqual({ clerkUserId: "clerk-a", sessionId: "session-a", name: "Demo Tester", email: "demo@example.com" }));
  it("rejects missing authorization or configuration", async () => {
    expect(await getClerkIdentity(request())).toBeNull();
    vi.stubEnv("CLERK_SECRET_KEY", ""); expect(await getClerkIdentity(request("token"))).toBeNull();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([{ sub: "clerk-a" }, { sid: "session-a" }])("rejects incomplete claims %j", async claims => { mocks.verify.mockResolvedValue(claims); expect(await getClerkIdentity(request("token"))).toBeNull(); });
  it.each([{ status: "revoked", userId: "clerk-a" }, { status: "active", userId: "different" }])("rejects invalid session %j", async session => { mocks.session.mockResolvedValue(session); expect(await getClerkIdentity(request("token"))).toBeNull(); });
  it.each([{ banned: true }, { locked: true }, { primaryEmailAddress: null }, { primaryEmailAddress: { verification: { status: "unverified" } } }])("rejects unsafe Clerk user %j", async user => { mocks.clerkUser.mockResolvedValue(user); expect(await getClerkIdentity(request("token"))).toBeNull(); });
  it("fails closed on Clerk errors", async () => { mocks.verify.mockRejectedValue(Error("unavailable")); expect(await getClerkIdentity(request("token"))).toBeNull(); });
  it("handles verified users without display names", async () => {
    mocks.clerkUser.mockResolvedValue({ primaryEmailAddress: { verification: { status: "verified" } } });
    expect(await getClerkIdentity(request("token"))).toMatchObject({ name: undefined, email: undefined });
  });
});
describe("authentication middleware", () => {
  const run = async (req: FastifyRequest) => { const res = reply(); await requireAuth(req, res as unknown as FastifyReply); return res; };
  it("rejects requests without bearer authorization", async () => expect((await run(request())).code).toHaveBeenCalledWith(401));
  it.each([null, { revokedAt: new Date() }])("rejects invalid/revoked API keys %j", async key => { mocks.key.mockResolvedValue(key); expect((await run(request(testApiKey))).code).toHaveBeenCalledWith(401); expect(mocks.touchKey).not.toHaveBeenCalled(); });
  it("loads key organization/scopes from storage and checks scope", async () => {
    mocks.key.mockResolvedValue({ id: "key", organizationId: "org", scopes: ["sales:write"], revokedAt: null });
    const req = request(testApiKey, "POST", "/v1/imports/transactions");
    expect((await run(req)).sent).toBe(false);
    expect(req.userContext).toMatchObject({ userId: "api-key:key", organizationId: "org", apiKeyScopes: ["sales:write"] });
    expect(mocks.key).toHaveBeenCalledWith({ where: { keyHash: hashPassword(testApiKey) } });
    expect((await run(request(testApiKey, "POST", "/v1/ingredients"))).code).toHaveBeenCalledWith(403);
  });
  it("uses current database role, not the role encoded in the token", async () => {
    const req = request(issueToken(identity, secret)); await run(req);
    expect(req.userContext?.role).toBe("VIEWER");
  });
  it.each([null, { role: "OWNER", user: { status: "DISABLED", authVersion: 2 } }, { role: "OWNER", user: { status: "ACTIVE", authVersion: 3 } }, { role: "OWNER", user: { status: "ACTIVE", authVersion: 2, clerkUserId: "clerk-a" } }])("rejects invalid local membership %j", async membership => {
    mocks.membership.mockResolvedValue(membership); expect((await run(request(issueToken(identity, secret)))).code).toHaveBeenCalledWith(403);
  });
  it("rejects invalid tokens when Clerk cannot verify them", async () => { mocks.verify.mockRejectedValue(Error("invalid")); expect((await run(request("invalid"))).code).toHaveBeenCalledWith(401); });
  it("resolves the Clerk user's own membership", async () => {
    const req = request("clerk-token"); expect((await run(req)).sent).toBe(false);
    expect(req.userContext).toMatchObject({ organizationId: "org", clerkSessionId: "session-a" });
    expect(mocks.user).toHaveBeenCalledWith({ where: { clerkUserId: "clerk-a" }, include: { memberships: true } });
  });
  it.each([null, { memberships: [] }])("requires onboarding if membership missing %j", async user => { mocks.user.mockResolvedValue(user); expect((await run(request("clerk-token"))).code).toHaveBeenCalledWith(409); });
  it("rejects disabled Clerk-linked users", async () => { mocks.user.mockResolvedValue({ status: "DISABLED", memberships: [{}] }); expect((await run(request("clerk-token"))).code).toHaveBeenCalledWith(403); });
  it("never chooses an arbitrary organization for multi-membership users", async () => { mocks.user.mockResolvedValue({ status: "ACTIVE", memberships: [{}, {}] }); const res = await run(request("clerk-token")); expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: "WORKSPACE_REQUIRED" }) })); });
  it("stops scope checks after an authentication rejection", async () => {
    const res = reply(); await requireScope("master:write")(request(), res as unknown as FastifyReply); expect(res.send).toHaveBeenCalledTimes(1);
  });
  it("requires an additional handler-specific scope for API keys", async () => {
    mocks.key.mockResolvedValue({ id: "key", organizationId: "org", scopes: ["master:write"] });
    const res = reply(); await requireScope("inventory:write")(request(testApiKey, "GET", "/v1/outlets"), res as unknown as FastifyReply);
    expect(res.send).toHaveBeenCalledWith({ error: { code: "INSUFFICIENT_SCOPE", message: "API key requires inventory:write" } });
  });
  it("permits authenticated users through scope middleware", async () => {
    const res = reply(); await requireScope("master:write")(request(issueToken(identity, secret)), res as unknown as FastifyReply); expect(res.sent).toBe(false);
  });
});
