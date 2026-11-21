import { describe, it, expect } from "vitest";
import { calculateDailyMetric, evaluateOutletHealth, policyFromSettings, mvpHealthPolicy } from "../src/index";
const metric = calculateDailyMetric({ outletId: "a", metricDate: "2026-09-17", grossSales: 100, netSales: 100, transactionCount: 1, cogs: 35, opex: 25, discountAmount: 0 });
const input = { trailing7: [metric], prior7: [], trailing30: [metric], prior30: [] };
describe("organization health targets", () => {
  it("preserves the legacy policy until targets are saved", () => { expect(policyFromSettings(null)).toEqual(mvpHealthPolicy); expect(policyFromSettings({})).toEqual(mvpHealthPolicy); });
  it("applies cost target to both scoring and diagnosis", () => {
    const base = evaluateOutletHealth(input);
    const configured = evaluateOutletHealth(input, policyFromSettings({ targets: { foodCost: "30", margin: "50" } }));
    expect(configured.marginScore).toBeLessThan(base.marginScore);
    expect(configured.issues).toContainEqual(expect.objectContaining({ type: "HIGH_HPP", targetValue: 30 }));
    expect(configured.issues).toContainEqual(expect.objectContaining({ metricName: "net_margin_percentage", currentValue: 40, targetValue: 50 }));
  });
  it("uses safe defaults for corrupted stored values", () => {
    expect(policyFromSettings({ targets: { foodCost: "bad", margin: 500 } }).targets).toMatchObject({ hppPercentage: 40, netMarginPercentage: 24 });
    expect(policyFromSettings({ targets: { foodCost: "", margin: -1 } }).targets).toMatchObject({ hppPercentage: 40, netMarginPercentage: 24 });
  });
  it("flags negative net margin as critical", () => {
    const bad = { ...metric, opex: 100 }; const result = evaluateOutletHealth({ ...input, trailing7: [bad] }, policyFromSettings({ targets: { foodCost: 40, margin: 24 } }));
    expect(result.issues).toContainEqual(expect.objectContaining({ metricName: "net_margin_percentage", severity: "CRITICAL" }));
  });
});
