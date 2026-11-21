import { describe, expect, it } from "vitest";
import { calculateDailyMetric, evaluateOutletHealth } from "../src/index.js";

function metric(day: number, overrides: Partial<ReturnType<typeof calculateDailyMetric>> = {}) {
  return calculateDailyMetric({
      outletId: "outlet-1",
      metricDate: `2026-09-${String(day).padStart(2, "0")}`,
      grossSales: 10_800_000,
      netSales: 10_000_000,
      transactionCount: 100,
      cogs: 3_100_000,
      opex: 2_100_000,
      discountAmount: 800_000,
      ...overrides,
    });
}

describe("health engine", () => {
  it("calculates deterministic daily metrics", () => {
    const result = calculateDailyMetric({
      outletId: "outlet-1",
      metricDate: "2026-09-11",
      grossSales: 10_800_000,
      netSales: 10_000_000,
      transactionCount: 100,
      cogs: 4_260_000,
      opex: 2_500_000,
      discountAmount: 800_000
    });

    expect(result.hppPercentage).toBe(42.6);
    expect(result.averageOrderValue).toBe(100000);
    expect(result.grossMarginPercentage).toBe(57.4);
  });

  it("detects high HPP with estimated financial impact", () => {
    const trailing7 = Array.from({ length: 7 }, (_, index) => metric(index + 1, { cogs: 4_260_000, netSales: 10_000_000 }));
    const prior7 = Array.from({ length: 7 }, (_, index) => metric(index + 8, { cogs: 7_440_000, netSales: 20_000_000 }));

    const result = evaluateOutletHealth({
      trailing7,
      prior7,
      trailing30: trailing7,
      prior30: prior7
    });

    expect(result.status).toBe("CRITICAL");
    expect(result.issues.some((issue) => issue.type === "HIGH_HPP")).toBe(true);
    expect(result.issues.find((issue) => issue.type === "HIGH_HPP")?.financialImpactEstimate).toBe(1820000);
    expect(result.issues.find((issue) => issue.type === "HIGH_HPP")?.severity).toBe("CRITICAL");
  });

  it("skips comparable-period issues without enough prior history", () => {
    const result = evaluateOutletHealth({
      trailing7: Array.from({ length: 7 }, (_, index) => metric(index + 1)),
      prior7: [],
      trailing30: [],
      prior30: []
    });

    expect(result.issues.find((issue) => issue.type === "MARGIN_DECLINE")).toBeUndefined();
    expect(result.overallScore).toBeGreaterThan(70);
  });
  it("weights cost percentages by sales instead of averaging daily percentages", () => {
    const trailing7 = [metric(1, { netSales: 100, cogs: 90 }), metric(2, { netSales: 10000, cogs: 1000 })];
    const result = evaluateOutletHealth({ trailing7, prior7: [], trailing30: trailing7, prior30: [] });
    expect(result.issues.some(i => i.type === "HIGH_HPP")).toBe(false);
  });
});
