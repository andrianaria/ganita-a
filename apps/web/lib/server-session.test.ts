import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getToken: vi.fn(), cookie: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ getToken: mocks.getToken }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
import { apiRequest, proxyApi, sessionToken } from "./server-session";
import { POST as revokeApiKey } from "../app/api/integrations/api-keys/[id]/revoke/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "configured"); vi.stubEnv("CLERK_SECRET_KEY", "configured");
  vi.stubEnv("API_BASE_URL", "https://ganita-api.example.test");
  mocks.cookie.mockReturnValue({ value: "old-account-a" });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("never uses account A cookie when account B is active", async () => {
  mocks.getToken.mockResolvedValue("active-account-b");
  expect(await sessionToken()).toBe("active-account-b");
  expect(mocks.cookie).not.toHaveBeenCalled();
});
it("does not fall back to cookies when Clerk is signed out", async () => {
  mocks.getToken.mockResolvedValue(null);
  expect(await sessionToken()).toBeNull();
  expect(mocks.cookie).not.toHaveBeenCalled();
});
it("supports local sessions only when Clerk is disabled", async () => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ""); vi.stubEnv("CLERK_SECRET_KEY", "");
  expect(await sessionToken()).toBe("old-account-a");
  mocks.cookie.mockReturnValue(undefined); expect(await sessionToken()).toBeNull();
  expect(mocks.getToken).not.toHaveBeenCalled();
});
it.each(["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"])("fails closed if %s is missing from a partial Clerk config", async name => {
  vi.stubEnv(name, ""); expect(await sessionToken()).toBeNull(); expect(mocks.cookie).not.toHaveBeenCalled();
});
it("returns 401 without contacting the API when signed out", async () => {
  mocks.getToken.mockResolvedValue(null);
  const response = await apiRequest("/v1/dashboard");
  expect(response.status).toBe(401); expect(fetch).not.toHaveBeenCalled();
});
it("forwards only the current server-selected session and disables caching", async () => {
  mocks.getToken.mockResolvedValue("current-session");
  vi.mocked(fetch).mockResolvedValue(Response.json({ data: "ok" }));
  await apiRequest("/v1/imports/transactions", { method: "POST", body: "{}", headers: { Authorization: "Bearer untrusted", "X-Request-Id": "test" } });
  expect(fetch).toHaveBeenCalledWith("https://ganita-api.example.test/v1/imports/transactions", expect.objectContaining({ method: "POST", body: "{}", cache: "no-store" }));
  const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
  expect(headers.get("Authorization")).toBe("Bearer current-session");
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get("X-Request-Id")).toBe("test");
});
it.each([undefined, null, ""])("omits JSON content type for an empty body (%s)", async body => {
  mocks.getToken.mockResolvedValue("token");
  vi.mocked(fetch).mockResolvedValue(Response.json({ data: "ok" }));
  for (const method of ["GET", "POST", "DELETE"]) {
    await apiRequest("/v1/example", { method, body, headers: new Headers({ "content-type": "application/json" }) });
    const init = vi.mocked(fetch).mock.lastCall?.[1];
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
  }
});
it("preserves explicit content types and overrides tuple authorization headers", async () => {
  mocks.getToken.mockResolvedValue("trusted");
  vi.mocked(fetch).mockResolvedValue(Response.json({}));
  await apiRequest("/v1/example", { method: "POST", body: "a,b", headers: [["content-type", "text/csv"], ["authorization", "Bearer untrusted"]] });
  const headers = new Headers(vi.mocked(fetch).mock.lastCall?.[1]?.headers);
  expect(headers.get("content-type")).toBe("text/csv");
  expect(headers.get("authorization")).toBe("Bearer trusted");
});
it("forwards the actual revoke route without an empty JSON payload", async () => {
  mocks.getToken.mockResolvedValue("token");
  vi.mocked(fetch).mockResolvedValue(Response.json({ data: { id: "test-key", status: "REVOKED" } }));
  const result = await revokeApiKey(new Request("https://web.example.test/api/integrations/api-keys/test-key/revoke", { method: "POST" }), { params: Promise.resolve({ id: "test-key" }) });
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: { id: "test-key", status: "REVOKED" } });
  expect(fetch).toHaveBeenCalledWith("https://ganita-api.example.test/v1/api-keys/test-key/revoke", expect.objectContaining({ method: "POST", body: undefined }));
  expect(new Headers(vi.mocked(fetch).mock.lastCall?.[1]?.headers).has("content-type")).toBe(false);
});
it("uses localhost fallback only when API_BASE_URL is absent", async () => {
  vi.stubEnv("API_BASE_URL", undefined); mocks.getToken.mockResolvedValue("token");
  vi.mocked(fetch).mockResolvedValue(Response.json({})); await apiRequest("/v1/auth/me");
  expect(fetch).toHaveBeenCalledWith("http://localhost:4000/v1/auth/me", expect.any(Object));
});
it("preserves API error status and body", async () => {
  mocks.getToken.mockResolvedValue("token"); const body = { error: { message: "Forbidden" } };
  vi.mocked(fetch).mockResolvedValue(Response.json(body, { status: 403 }));
  const result = await proxyApi("/v1/api-keys"); expect(result.status).toBe(403); expect(await result.json()).toEqual(body);
});
it("forwards mutation bodies", async () => {
  mocks.getToken.mockResolvedValue("token"); vi.mocked(fetch).mockResolvedValue(Response.json({ data: "created" }, { status: 201 }));
  const result = await proxyApi("/v1/api-keys", new Request("https://web.example.test", { method: "POST", body: '{"name":"POS"}' }), "POST");
  expect(result.status).toBe(201); expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: '{"name":"POS"}' }));
});
it.each(["network", "invalid-json"])("returns a safe gateway error on %s failure", async failure => {
  mocks.getToken.mockResolvedValue("token");
  if (failure === "network") vi.mocked(fetch).mockRejectedValue(Error("secret backend details"));
  else vi.mocked(fetch).mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
  const result = await proxyApi("/v1/dashboard"); expect(result.status).toBe(502); expect(JSON.stringify(await result.json())).not.toContain("secret");
});
