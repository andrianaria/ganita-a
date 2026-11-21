import { describe, expect, it } from "vitest";
import { insightOutputSchema, MockInsightProvider } from "./index";
const action = { label: "Check HPP", priority: "HIGH" };
const output = { summary: "Summary", explanation: "Evidence", recommendedActions: Array(3).fill(action) };
describe("insight contract (not a live AI provider)", () => {
  it("validates the mock provider's output against the same schema", async () => {
    const result = await new MockInsightProvider().generateInsight({ outlet: "Outlet A", issueType: "HIGH_HPP", metricName: "hpp_percentage" });
    expect(insightOutputSchema.parse(result)).toEqual(result);
    expect(result.summary).toContain("Outlet A"); expect(result.summary).toContain("hpp_percentage");
  });
  it.each([2, 6])("rejects %s actions", count => expect(insightOutputSchema.safeParse({ ...output, recommendedActions: Array(count).fill(action) }).success).toBe(false));
  it.each([{ summary: "" }, { explanation: "" }, { recommendedActions: Array(3).fill({ label: "", priority: "HIGH" }) }, { recommendedActions: Array(3).fill({ ...action, priority: "URGENT" }) }])("rejects invalid insight %j", override => expect(insightOutputSchema.safeParse({ ...output, ...override }).success).toBe(false));
});
