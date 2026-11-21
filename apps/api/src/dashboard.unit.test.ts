import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ organization: { findUniqueOrThrow: vi.fn() }, outlet: { findMany: vi.fn() }, dailyOutletMetric: { findMany: vi.fn() }, stockBalance: { findMany: vi.fn() }, product: { findMany: vi.fn() } }));
vi.mock("@ganita-ai/database", async () => ({ prisma: db, ...await import("../../../packages/database/src/metrics") }));
import { dashboardData } from "./dashboard";
const decimal = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const outlets = [{ id: "a", name: "A", code: "A", timezone: "Asia/Jakarta", brandId: "brand-a" }, { id: "b", name: "B", code: "B", timezone: "UTC", brandId: "brand-b" }];
const metric = (outletId = "a", overrides = {}) => ({ outletId, metricDate: new Date("2026-09-17"), updatedAt: new Date("2026-09-17T01:00:00Z"), grossSales: decimal(100), netSales: decimal(90), cogs: decimal(27), opex: decimal(18), grossProfit: decimal(63), discountAmount: decimal(10), transactionCount: 2, averageOrderValue: decimal(45), hppPercentage: decimal(30), opexPercentage: decimal(20), grossMarginPercentage: decimal(70), discountPercentage: decimal(10), costComplete: true, opexComplete: true, ...overrides });
const dates = { from: "2026-09-01", to: "2026-09-17" };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T18:00:00Z"));
  db.organization.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Jakarta", currency: "IDR" });
  db.outlet.findMany.mockResolvedValue(outlets);
  db.dailyOutletMetric.findMany.mockResolvedValue([metric(), metric("b")]);
  db.stockBalance.findMany.mockResolvedValue([]); db.product.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
describe("live dashboard data", () => {
  it("aggregates all outlets with amount-weighted ratios", async () => {
    const result = await dashboardData("org", dates);
    expect(result.summary).toMatchObject({ netSales: 180, transactionCount: 4, averageOrderValue: 45, cogs: 54, opex: 36, grossProfit: 126, netProfit: 90, foodCost: 30, margin: 70 });
    expect(result.outlets).toHaveLength(2); expect(result.organizationScore).toBe(100);
    expect(result.metrics).toHaveLength(2);
    expect(db.organization.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "org" } });
  });
  it("scopes metrics, products and stock to the selected outlet and tenant", async () => {
    db.outlet.findMany.mockResolvedValue([outlets[1]]); db.dailyOutletMetric.findMany.mockResolvedValue([metric("b")]);
    const result = await dashboardData("org", { ...dates, outletId: "b" });
    expect(result.summary.netSales).toBe(90); expect(result.timezone).toBe("UTC");
    expect(db.dailyOutletMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org", outletId: "b" }) }));
    expect(db.stockBalance.findMany).toHaveBeenCalledWith({ where: { organizationId: "org", stockLocation: { organizationId: "org", outletId: "b" } }, include: { ingredient: true, stockLocation: true } });
    expect(db.product.findMany.mock.calls[0][0].where).toEqual({ organizationId: "org", OR: [{ brandId: "brand-b" }, { transactionItems: { some: { organizationId: "org", outletId: "b" } } }] });
  });
  it("rejects unavailable outlets before querying operational data", async () => {
    db.outlet.findMany.mockResolvedValue([]);
    await expect(dashboardData("org", { outletId: "foreign" })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.dailyOutletMetric.findMany).not.toHaveBeenCalled();
  });
  it("uses organization timezone for default dates across multiple outlets", async () => {
    const result = await dashboardData("org", {}); expect(result.to).toBe("2026-09-17"); expect(result.from).toBe("2026-08-19");
  });
  it("uses selected outlet timezone for default dates", async () => {
    db.outlet.findMany.mockResolvedValue([outlets[1]]);
    expect((await dashboardData("org", { outletId: "b" })).to).toBe("2026-09-16");
  });
  it.each([undefined, "a"])("supports legacy account zones with outlet filter %s", async outletId => {
    db.organization.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Jakarta (GMT+7)", currency: "IDR" });
    db.outlet.findMany.mockResolvedValue([{ ...outlets[0], timezone: "Asia/Jakarta (GMT+7)" }]);
    const result = await dashboardData("org", { outletId });
    expect(result.to).toBe("2026-09-17");
    expect(result.timezone).toBe("Asia/Jakarta");
    expect(result.outlets[0].timezone).toBe("Asia/Jakarta");
  });
  it.each([{ from: "2026-09-18", to: "2026-09-17" }, { from: "2024-01-01", to: "2026-01-01" }])("rejects invalid date span %j", async query => await expect(dashboardData("org", query)).rejects.toMatchObject({ statusCode: 400 }));
  it("returns empty/unknown rather than demo data for a new organization", async () => {
    db.outlet.findMany.mockResolvedValue([]); db.dailyOutletMetric.findMany.mockResolvedValue([]);
    const result = await dashboardData("org", dates);
    expect(result.outlets).toEqual([]); expect(result.organizationScore).toBeNull();
    expect(result.summary).toMatchObject({ netSales: 0, averageOrderValue: 0, cogs: null, netProfit: null, foodCost: null });
  });
  it.each(["costComplete", "opexComplete"])("withholds organization score when %s is false for one outlet", async field => {
    db.dailyOutletMetric.findMany.mockResolvedValue([metric(), metric("b", { [field]: false })]);
    const result = await dashboardData("org", dates);
    expect(result.summary.netProfit).toBeNull(); expect(result.outlets[1].score).toBeNull(); expect(result.organizationScore).toBeNull();
    if (field === "costComplete") { expect(result.summary.cogs).toBeNull(); expect(result.summary.grossProfit).toBeNull(); }
  });
  it("uses historical rows for comparisons but not selected-period sales totals", async () => {
    db.outlet.findMany.mockResolvedValue([outlets[0]]);
    db.dailyOutletMetric.findMany.mockResolvedValue([metric("a", { metricDate: new Date("2026-08-31") }), metric()]);
    expect((await dashboardData("org", dates)).summary.netSales).toBe(90);
  });
  it("does not assign scores to outlets without transactions in the last week", async () => {
    db.dailyOutletMetric.findMany.mockResolvedValue([metric("a", { metricDate: new Date("2026-09-01") })]);
    const result = await dashboardData("org", dates); expect(result.outlets[0].score).toBeNull(); expect(result.outlets[1].lastUpdatedAt).toBeNull();
  });
  it("keeps zero-sales ratios unavailable and no-sale health unscored", async () => {
    db.dailyOutletMetric.findMany.mockResolvedValue([metric("a", { netSales: decimal(0), transactionCount: 0 })]);
    const result = await dashboardData("org", dates); expect(result.summary.foodCost).toBeNull(); expect(result.outlets[0].score).toBeNull();
  });
  it("serializes decimals and filters corrupt cross-tenant ingredient joins", async () => {
    db.product.findMany.mockResolvedValue([{ id: "p", name: "Roll", active: true, sellingPrice: decimal(50), estimatedCost: null }, { id: "p2", name: "Tea", sellingPrice: null, estimatedCost: decimal(5) }]);
    const balance = { id: "s", ingredient: { organizationId: "org", name: "Rice" }, stockLocation: { name: "Kitchen" }, onHandQuantity: decimal(3), unit: "kg", reorderPoint: decimal(4) };
    db.stockBalance.findMany.mockResolvedValue([balance, { ...balance, id: "s2", reorderPoint: null }, { ...balance, ingredient: { organizationId: "other", name: "Private" } }]);
    const result = await dashboardData("org", dates);
    expect(result.products[0]).toMatchObject({ sellingPrice: 50, estimatedCost: null }); expect(result.products[1]).toMatchObject({ sellingPrice: null, estimatedCost: 5 });
    expect(result.balances).toHaveLength(2); expect(result.balances[0]).toMatchObject({ onHand: 3, reorderPoint: 4 }); expect(result.balances[1].reorderPoint).toBeNull();
  });
});
