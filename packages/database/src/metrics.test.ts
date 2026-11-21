import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { aggregateDaily, businessDate, rebuildOutletMetrics, normalizeStoredTimezone } from "./metrics";
const sale = (overrides = {}) => ({ occurredAt: new Date("2026-09-16T18:00:00Z"), status: "PAID", grossSales: 100, netSales: 90, discountAmount: 10, totalCost: 40, transactionItems: [], ...overrides });

describe("business dates", () => {
  it.each([["Asia/Jakarta (GMT+7)", "Asia/Jakarta"], ["Asia/Makassar (GMT+8)", "Asia/Makassar"], ["Asia/Jayapura (GMT+9)", "Asia/Jayapura"]])("supports the legacy onboarding label %s", (label, zone) => {
    expect(normalizeStoredTimezone(label)).toBe(zone);
    expect(businessDate(sale().occurredAt, label)).toBe(businessDate(sale().occurredAt, zone));
    expect(aggregateDaily([sale()], [], label)).toEqual(aggregateDaily([sale()], [], zone));
  });
  it.each([["Asia/Jakarta", "2026-09-17"], ["UTC", "2026-09-16"], ["America/New_York", "2026-09-16"]])("uses outlet timezone %s", (zone, date) => expect(businessDate(sale().occurredAt, zone)).toBe(date));
  it("handles DST without assuming a fixed UTC offset", () => {
    expect(businessDate(new Date("2026-07-01T04:30:00Z"), "America/New_York")).toBe("2026-07-01");
    expect(businessDate(new Date("2026-01-01T04:30:00Z"), "America/New_York")).toBe("2025-12-31");
  });
  it("rejects invalid timezone identifiers", () => expect(() => businessDate(new Date(), "Invalid/Zone")).toThrow());
});
describe("daily aggregation", () => {
  it("returns no invented metrics for empty input", () => expect(aggregateDaily([], [], "UTC")).toEqual([]));
  it("totals transactions and uses date-only expense dates without shifting timezone", () => {
    const result = aggregateDaily([sale(), sale({ status: "completed" })], [{ expenseDate: new Date("2026-09-17"), amount: 30 }], "Asia/Jakarta");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ metricDate: new Date("2026-09-17"), grossSales: 200, netSales: 180, transactionCount: 2, averageOrderValue: 90, cogs: 80, opex: 30, grossProfit: 100, hppPercentage: 44.4444, costComplete: true, opexComplete: true });
  });
  it.each(["VOID", "CANCELLED", "REFUNDED", "PENDING"])("excludes %s sales", status => expect(aggregateDaily([sale({ status })], [], "UTC")).toEqual([]));
  it("uses complete item costs when order costs are absent", () => {
    const result = aggregateDaily([sale({ totalCost: null, transactionItems: [{ totalCost: 10, unitCost: 999, quantity: 2 }, { totalCost: null, unitCost: 3, quantity: 4 }] })], [], "UTC");
    expect(result[0]).toMatchObject({ cogs: 22, costComplete: true, opexComplete: false });
  });
  it.each([{ transactionItems: [] }, { transactionItems: [{ totalCost: null, unitCost: null, quantity: 1 }] }])("marks unavailable item cost as incomplete: %j", ({ transactionItems }) => {
    expect(aggregateDaily([sale({ totalCost: null, transactionItems })], [], "UTC")[0].costComplete).toBe(false);
  });
  it("preserves genuine zero cost and explicit order-level costs", () => {
    expect(aggregateDaily([sale({ totalCost: 0 })], [], "UTC")[0]).toMatchObject({ cogs: 0, costComplete: true });
  });
  it("supports expense-only days and zero sales without Infinity", () => {
    expect(aggregateDaily([], [{ expenseDate: new Date("2026-09-01"), amount: 25 }], "UTC")[0]).toMatchObject({ transactionCount: 0, netSales: 0, averageOrderValue: 0, opex: 25, opexPercentage: 0, opexComplete: true });
  });
  it("sorts dates and rounds decimal aggregates", () => {
    const rows = aggregateDaily([sale({ netSales: 0.1, totalCost: 0.1 }), sale({ netSales: 0.2, totalCost: 0.2 }), sale({ occurredAt: new Date("2026-09-01") })], [], "UTC");
    expect(rows.map(r => r.metricDate.toISOString().slice(0, 10))).toEqual(["2026-09-01", "2026-09-16"]);
    expect(rows[1]).toMatchObject({ netSales: 0.3, cogs: 0.3 });
  });
});
describe("metric rebuild orchestration", () => {
  const transaction = () => ({ outlet: { findFirstOrThrow: vi.fn().mockResolvedValue({ timezone: "UTC" }) }, transaction: { findMany: vi.fn().mockResolvedValue([sale()]) }, expense: { findMany: vi.fn().mockResolvedValue([]) }, dailyOutletMetric: { deleteMany: vi.fn(), createMany: vi.fn() } });
  it("scopes every query/write and replaces obsolete derived rows", async () => {
    const tx = transaction();
    expect(await rebuildOutletMetrics(tx as unknown as Prisma.TransactionClient, "org", "outlet")).toBe(1);
    expect(tx.outlet.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: "outlet", organizationId: "org" } });
    expect(tx.transaction.findMany).toHaveBeenCalledWith({ where: { organizationId: "org", outletId: "outlet" }, include: { transactionItems: true } });
    expect(tx.expense.findMany).toHaveBeenCalledWith({ where: { organizationId: "org", outletId: "outlet" } });
    expect(tx.dailyOutletMetric.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org", outletId: "outlet" } });
    expect(tx.dailyOutletMetric.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ organizationId: "org", outletId: "outlet", netSales: 90 })] });
  });
  it("removes obsolete metrics even when every transaction was voided", async () => {
    const tx = transaction(); tx.transaction.findMany.mockResolvedValue([]);
    expect(await rebuildOutletMetrics(tx as unknown as Prisma.TransactionClient, "org", "outlet")).toBe(0);
    expect(tx.dailyOutletMetric.deleteMany).toHaveBeenCalledOnce();
    expect(tx.dailyOutletMetric.createMany).not.toHaveBeenCalled();
  });
});
