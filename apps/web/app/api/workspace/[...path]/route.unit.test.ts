import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../lib/server-session", () => ({ apiRequest: mocks.request }));
import { GET, POST } from "./route";
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => { mocks.request.mockReset(); });
describe("authenticated workspace proxy", () => {
  it.each([["..", "secret"], ["https:", "evil.example"], ["auth", "login"], ["unknown"]])("rejects paths outside the allowlist %j", async (...path) => {
    expect((await GET(new Request("http://localhost/api/workspace/test"), context(...path))).status).toBe(404); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("preserves queries and delegates authentication to the server session helper", async () => {
    mocks.request.mockResolvedValue(Response.json({ data: [] }));
    const response = await GET(new Request("http://localhost/api/workspace/inspections?outletId=123"), context("inspections"));
    expect(response.status).toBe(200); expect(mocks.request).toHaveBeenCalledWith("/v1/inspections?outletId=123", { method: "GET", body: undefined });
  });
  it("forwards mutations without trusting browser authorization headers", async () => {
    mocks.request.mockResolvedValue(Response.json({ data: {} }, { status: 201 }));
    const response = await POST(new Request("http://localhost/api/workspace/outlets", { method: "POST", headers: { Authorization: "untrusted" }, body: '{"name":"Outlet"}' }), context("outlets"));
    expect(response.status).toBe(201); expect(mocks.request).toHaveBeenCalledWith("/v1/outlets", { method: "POST", body: '{"name":"Outlet"}' });
  });
  it("streams binary exports instead of trying to parse JSON", async () => {
    mocks.request.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="test.pdf"' } }));
    const response = await GET(new Request("http://localhost/api/workspace/reports/export?format=pdf"), context("reports", "export"));
    expect(await response.text()).toBe("%PDF"); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("Content-Disposition")).toContain("test.pdf");
  });
  it("preserves unauthorized status and handles connection errors", async () => {
    mocks.request.mockResolvedValue(Response.json({ error: { message: "Missing session" } }, { status: 401 }));
    expect((await GET(new Request("http://localhost/test"), context("team"))).status).toBe(401);
    mocks.request.mockRejectedValue(Error("down")); expect((await GET(new Request("http://localhost/test"), context("team"))).status).toBe(502);
  });
});
