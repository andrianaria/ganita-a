import { randomBytes } from "node:crypto";
const testSession = randomBytes(24).toString("hex");
const testSecret = randomBytes(32).toString("hex");
const testPublishable = randomBytes(24).toString("hex");
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn(), fetch: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
import { POST } from "./route";

const payload = { fullName: "Test owner", companyName: "Test restaurant", businessType: "Restoran", outletName: "Test branch", outletCode: "TEST-01", address: "Jalan Uji 1", city: "Jakarta Timur", country: "Indonesia", timezone: "Asia/Jakarta", currency: "IDR" };
const request = (value: unknown = payload) => new Request("http://localhost/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", testPublishable);
  vi.stubEnv("CLERK_SECRET_KEY", testSecret);
  vi.stubEnv("API_BASE_URL", "http://api.test");
  mocks.auth.mockResolvedValue({ getToken: mocks.token });
  mocks.token.mockResolvedValue(testSession);
  mocks.fetch.mockImplementation(async () => Response.json({ data: { token: testSession } }, { status: 201 }));
  vi.stubGlobal("fetch", mocks.fetch);
});

describe("onboarding proxy", () => {
  it("saves an integration profile without outlet details and discards stale manual fields", async () => {
    const response = await POST(request({ ...payload, mode: "integration", outletName: "", outletCode: undefined, city: undefined }));
    expect(response.status).toBe(200);
    const forwarded = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(forwarded).toMatchObject({ mode: "integration", fullName: payload.fullName, timezone: "Asia/Jakarta" });
    for (const field of ["outletName", "outletCode", "address", "city", "country"]) expect(forwarded).not.toHaveProperty(field);
  });
  it.each(["csv", "", false])("rejects invalid onboarding mode %s", async mode => {
    expect((await POST(request({ ...payload, mode }))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("fails closed without Clerk instead of claiming a profile was saved", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ""); vi.stubEnv("CLERK_SECRET_KEY", "");
    const response = await POST(request({ ...payload, mode: "integration" }));
    expect(response.status).toBe(503);
    expect(response.cookies.get("ganita_onboarding")).toBeUndefined();
  });
  it.each(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"])("sends canonical timezone %s", async timezone => {
    const response = await POST(request({ ...payload, timezone }));
    expect(response.status).toBe(200);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ timezone, currency: "IDR" });
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${testSession}`);
    expect(response.cookies.get("ganita_ai_token")?.value).toBe("");
  });
  it("normalizes labels submitted by already-open older onboarding forms", async () => {
    await POST(request({ ...payload, timezone: "Asia/Jakarta (GMT+7)", currency: "IDR - Rupiah" }));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ timezone: "Asia/Jakarta", currency: "IDR" });
  });
  it.each([null, [], { ...payload, fullName: 42 }, { ...payload, outletCode: " " }, { ...payload, timezone: "Not/AZone" }])("rejects malformed or incomplete data without contacting the API: %j", async value => {
    expect((await POST(request(value))).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/onboarding", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });
  it("names the field when upstream validation rejects a value", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: { issues: [{ path: ["outletCode"], message: "Required" }] } } }, { status: 400 }));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Kode outlet");
  });
  it("rejects missing Clerk sessions and partial config without creating a demo session", async () => {
    mocks.token.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.cookies.get("ganita_onboarding")).toBeUndefined();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(["network", "html", "invalid-success"])("shows a retryable failure for %s instead of success", async failure => {
    if (failure === "network") mocks.fetch.mockRejectedValue(Error("offline"));
    if (failure === "html") mocks.fetch.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    if (failure === "invalid-success") mocks.fetch.mockResolvedValue(Response.json({ data: {} }));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).ok).toBeUndefined();
  });
  it("preserves the upstream rejection status", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { message: "Akses onboarding ditolak." } }, { status: 403 }));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Akses onboarding ditolak.");
  });
});
