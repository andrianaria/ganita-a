import { describe, expect, it } from "vitest";
import { calculateDailyMetric, evaluateOutletHealth, mvpHealthPolicy } from "../src/index";

const metric = (overrides = {}) => calculateDailyMetric({ outletId: "a", metricDate: "2026-09-17", grossSales: 10000, netSales: 10000, transactionCount: 100, cogs: 3000, opex: 2000, discountAmount: 0, ...overrides });
const evaluate = (current = metric(), previous = metric(), history = 7) => evaluateOutletHealth({ trailing7: Array(7).fill(current), prior7: Array(history).fill(previous), trailing30: [], prior30: [] });

describe("health policy boundaries", () => {
  it("has normalized score weights", () => expect(Object.values(mvpHealthPolicy.weights).reduce((a, b) => a + b, 0)).toBe(1));
  it("returns the documented no-history sentinel without invented issues", () => {
    expect(evaluateOutletHealth({ trailing7: [], prior7: [], trailing30: [], prior30: [] })).toMatchObject({ overallScore: 0, issues: [], status: "CRITICAL" });
  });
  it("returns healthy with no warnings for stable healthy ratios", () => {
    expect(evaluate()).toMatchObject({ overallScore: 100, status: "HEALTHY", issues: [] });
  });
  it.each([[31.99, 100], [32, 85], [34.99, 85], [35, 65], [37.99, 65], [38, 40], [40, 40], [40.01, 20]])("HPP %s maps to score %s", (hpp, expected) => {
    expect(evaluate(metric({ cogs: hpp * 100 })).marginScore).toBe(expected);
  });
  it.each([[22.5, 100], [22.51, 85], [27, 85], [27.01, 70], [30, 70], [30.01, 45], [34.5, 45], [34.51, 25]])("OPEX %s maps to score %s", (opex, expected) => {
    expect(evaluate(metric({ opex: opex * 100 })).costScore).toBe(expected);
  });
  it.each([[40, undefined], [40.01, "WARNING"], [42, "WARNING"], [42.01, "CRITICAL"]])("HPP issue boundary %s", (hpp, severity) => {
    expect(evaluate(metric({ cogs: hpp * 100 })).issues.find(i => i.type === "HIGH_HPP")?.severity).toBe(severity);
  });
  it.each([[30, undefined], [30.01, "WARNING"], [35, "WARNING"], [35.01, "CRITICAL"]])("OPEX issue boundary %s", (opex, severity) => {
    const issue = evaluate(metric({ opex: opex * 100 })).issues.find(i => i.type === "HIGH_OPEX");
    expect(issue?.severity).toBe(severity);
    if (issue) expect(issue.financialImpactEstimate).toBeCloseTo((opex - 30) * 700, 2);
  });
  it.each([[12, undefined], [12.01, "WARNING"], [17, "WARNING"], [17.01, "CRITICAL"]])("discount issue boundary %s", (discount, severity) => {
    expect(evaluate(metric({ discountAmount: discount * 100 })).issues.find(i => i.type === "EXCESSIVE_DISCOUNT")?.severity).toBe(severity);
  });
  it.each([[14.99, undefined], [15, "WARNING"], [25, "WARNING"], [25.01, "CRITICAL"]])("sales decline boundary %s", (decline, severity) => {
    expect(evaluate(metric({ netSales: 10000 - decline * 100 })).issues.find(i => i.type === "SALES_DECLINE")?.severity).toBe(severity);
  });
  it.each([[5.99, undefined], [6, "WARNING"], [10, "WARNING"], [10.01, "CRITICAL"]])("margin decline boundary %s", (decline, severity) => {
    expect(evaluate(metric({ cogs: 3000 + decline * 100 })).issues.find(i => i.type === "MARGIN_DECLINE")?.severity).toBe(severity);
  });
  it.each([[9.99, undefined], [10, "WARNING"], [18, "WARNING"], [18.01, "CRITICAL"]])("AOV decline boundary %s", (decline, severity) => {
    expect(evaluate(metric({ netSales: 10000 - decline * 100 })).issues.find(i => i.type === "LOW_AVERAGE_ORDER")?.severity).toBe(severity);
  });
  it("does not compare AOV or margin against fewer than seven prior days", () => {
    const types = evaluate(metric({ netSales: 1000, cogs: 999 }), metric(), 6).issues.map(i => i.type);
    expect(types).not.toContain("MARGIN_DECLINE"); expect(types).not.toContain("LOW_AVERAGE_ORDER");
  });
  it("detects 30-day decline even when the latest week is stable", () => {
    const result = evaluateOutletHealth({ trailing7: [metric()], prior7: [metric()], trailing30: [metric({ netSales: 7000 })], prior30: [metric()] });
    expect(result.issues.find(i => i.type === "SALES_DECLINE")?.severity).toBe("CRITICAL");
    expect(result.revenueScore).toBe(25);
  });
  it.each([[9120, 78, "HEALTHY"], [8400, 60, "ATTENTION"], [8000, 50, "WARNING"], [7960, 49, "CRITICAL"]])("score status threshold for sales %s", (netSales, score, status) => {
    const result = evaluateOutletHealth({ trailing7: [metric({ netSales })], prior7: [metric()], trailing30: [], prior30: [] }, { ...mvpHealthPolicy, version: "test-policy", weights: { revenue: 1, margin: 0, cost: 0, operations: 0 } });
    expect(result).toMatchObject({ overallScore: score, status, healthPolicyVersion: "test-policy" });
  });
  it("clamps extreme declines and discounts to 0..100", () => {
    const result = evaluate(metric({ netSales: 1, discountAmount: 9900 }));
    for (const key of ["overallScore", "operationsScore", "revenueScore"] as const) {
      expect(result[key]).toBeGreaterThanOrEqual(0); expect(result[key]).toBeLessThanOrEqual(100);
    }
    expect(result.operationsScore).toBe(0); expect(result.revenueScore).toBe(0);
  });
  it("does not punish revenue growth or invent declines from a zero baseline", () => {
    expect(evaluate(metric({ netSales: 20000 })).revenueScore).toBe(100);
    expect(evaluate(metric(), metric({ netSales: 0, grossSales: 0 })).issues.map(i => i.type)).not.toContain("SALES_DECLINE");
  });
  it("handles no sales and transaction count without non-finite numbers", () => {
    const result = metric({ grossSales: 0, netSales: 0, transactionCount: 0, cogs: 0, opex: 0 });
    expect(result).toMatchObject({ averageOrderValue: 0, hppPercentage: 0, discountPercentage: 0, grossMarginPercentage: 0 });
  });
});
