import { expect, it, vi } from "vitest";
const proxy = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/server-session", () => ({ proxyApi: proxy }));
import { GET } from "./route";
it("forwards only outlet and date filters, never a client-supplied organization", async () => {
  await GET(new Request("https://example.test/api/dashboard?outletId=o&from=2026-09-01&to=2026-09-17&organizationId=foreign&token=secret"));
  expect(proxy).toHaveBeenCalledWith("/v1/dashboard?outletId=o&from=2026-09-01&to=2026-09-17");
});
it("omits blank filters", async () => { await GET(new Request("https://example.test/api/dashboard?outletId=")); expect(proxy).toHaveBeenCalledWith("/v1/dashboard?"); });
