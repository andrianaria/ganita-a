import { createRoot } from "react-dom/client";
import DashboardView from "../components/dashboard-view";
import OnboardingPage from "../app/onboarding/page";
import "../app/globals.css";

// Isolated visual fixture: no request ever reaches Ganita's API or Clerk.
const outlets = new URLSearchParams(location.search).has("empty") ? [] : new URLSearchParams(location.search).has("many") ? Array.from({ length: 120 }, (_, index) => ({ id: `outlet-${index}`, name: `Outlet ${String(index).padStart(3, "0")}`, code: `O-${index}`, timezone: "Asia/Jakarta" })) : [{ id: "test-a", name: "Outlet Uji A", code: "A", timezone: "Asia/Jakarta" }, { id: "test-b", name: "Outlet Uji B", code: "B", timezone: "UTC" }];
const assetFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.pathname !== "/api/dashboard") {
    if (url.origin === location.origin && url.pathname.startsWith("/api/")) return assetFetch(input, init);
    if (url.origin === location.origin && !url.pathname.startsWith("/api/")) return assetFetch(input, init);
    throw Error("Visual fixture has no live API access.");
  }
  const selected = outlets.filter(o => !url.searchParams.get("outletId") || o.id === url.searchParams.get("outletId"));
  const count = selected.length;
  return Response.json({ data: {
    from: "2026-09-01", to: "2026-09-17", currency: "IDR", timezone: "Asia/Jakarta", generatedAt: new Date().toISOString(), organizationScore: null,
    summary: { netSales: count * 125000, transactionCount: count * 2, averageOrderValue: 62500, cogs: count * 40000, grossProfit: count * 85000, netProfit: null, foodCost: 32, margin: 68, costComplete: true, opexComplete: false },
    outlets: selected.map(o => ({ ...o, netSales: 125000, transactionCount: 2, cogs: 40000, foodCost: 32, margin: 68, score: null, health: null, lastUpdatedAt: "2026-09-17T08:00:00Z" })),
    metrics: selected.map(o => ({ outletId: o.id, date: "2026-09-17", netSales: 125000, transactionCount: 2 })),
    products: [{ id: "p", name: "Salmon Roll", sellingPrice: 45000, estimatedCost: null, active: true }],
    balances: [{ id: "b", name: "Salmon", location: "Dapur", onHand: 3, unit: "kg", reorderPoint: 4 }],
  } });
};
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).get("view") === "onboarding" ? <OnboardingPage /> : <DashboardView userName="Pengujian UI" timezone="Asia/Jakarta" initialOutlets={outlets} />);

// Read-only render probe for browser regression checks, isolated from the Next app.
const probe = document.createElement("output");
probe.hidden = true;
probe.dataset.testid = "canvas-probe";
document.body.append(probe);
setInterval(() => requestAnimationFrame(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2");
  if (!canvas || !gl) return;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set<number>();
  let hash = 0;
  for (let i = 0; i < pixels.length; i += 256) {
    const color = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    colors.add(color);
    hash = (Math.imul(hash, 31) + color) >>> 0;
  }
  probe.textContent = JSON.stringify({ width: canvas.width, height: canvas.height, colors: colors.size, hash });
}), 1000);
