import { beforeEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/server-session", () => ({ apiRequest: request }));
import { POST } from "./route";
beforeEach(() => { request.mockReset(); });
it.each([200, 401, 403, 409])("clears both cookies on already-signed-out or successful status %s", async status => {
  request.mockResolvedValue(new Response(null, { status })); const result = await POST();
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ ok: true });
  expect(request).toHaveBeenCalledWith("/v1/auth/logout", { method: "POST" });
  for (const cookie of ["ganita_ai_token", "ganita_onboarding"]) {
    expect(result.cookies.get(cookie)?.value).toBe("");
    const expires = result.cookies.get(cookie)?.expires;
    expect(expires instanceof Date ? expires.getTime() : expires).toBe(0);
  }
});
it.each(["unavailable", "500"])("clears browser cookies but does not claim server revocation on %s", async failure => {
  if (failure === "unavailable") request.mockRejectedValue(Error("offline")); else request.mockResolvedValue(new Response(null, { status: 500 }));
  const result = await POST(); expect(result.status).toBe(503); expect(await result.json()).toEqual({ ok: false });
  expect(result.cookies.get("ganita_ai_token")?.value).toBe("");
});
