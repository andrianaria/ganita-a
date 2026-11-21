import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  config: { LLM_PROVIDER: "mock", APP_ENV: "test" }, rebuild: vi.fn(), evaluate: vi.fn(), generate: vi.fn(), lock: vi.fn(),
  db: { $transaction: vi.fn(), outlet: { findFirstOrThrow: vi.fn(), findMany: vi.fn() }, dailyOutletMetric: { findMany: vi.fn() }, outletHealthSnapshot: { upsert: vi.fn() }, healthIssue: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }, insight: { create: vi.fn() }, syncJob: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@ganita-ai/database", async () => ({ prisma: mocks.db, rebuildOutletMetrics: mocks.rebuild, businessDate: (await import("../../../packages/database/src/metrics")).businessDate }));
vi.mock("@ganita-ai/config", () => ({ loadConfig: () => mocks.config }));
vi.mock("@ganita-ai/health-engine", async () => ({ evaluateOutletHealth: mocks.evaluate, policyFromSettings: (await import("../../../packages/health-engine/src/policy")).policyFromSettings }));
vi.mock("@ganita-ai/insights", () => ({ MockInsightProvider: class { generateInsight = mocks.generate; } }));
import { generatePendingInsights, processQueuedJobs, recalculateOutletHealth } from "./worker";
const metric = (overrides = {}) => ({ outletId: "outlet", metricDate: new Date("2026-09-17"), grossSales: 100, netSales: 90, transactionCount: 2, averageOrderValue: 45, cogs: 40, hppPercentage: 44.4444, opex: 20, opexPercentage: 22.2222, grossProfit: 50, grossMarginPercentage: 55.5556, discountAmount: 10, discountPercentage: 10, costComplete: true, opexComplete: true, ...overrides });
const issue = { type: "HIGH_HPP", severity: "WARNING", title: "HPP", description: "High HPP", metricName: "hpp_percentage", currentValue: 44, previousValue: 38, targetValue: 40, financialImpactEstimate: 100 };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-16T18:00:00Z")); mocks.config.LLM_PROVIDER = "mock";
  mocks.db.$transaction.mockImplementation(callback => callback({ $executeRaw: mocks.lock }));
  mocks.db.outlet.findFirstOrThrow.mockResolvedValue({ timezone: "Asia/Jakarta" }); mocks.db.outlet.findMany.mockResolvedValue([{ id: "outlet" }]);
  mocks.db.dailyOutletMetric.findMany.mockResolvedValue([metric()]); mocks.db.outletHealthSnapshot.upsert.mockResolvedValue({ id: "snapshot" });
  mocks.evaluate.mockReturnValue({ healthPolicyVersion: "v1", overallScore: 70, revenueScore: 100, marginScore: 40, costScore: 85, operationsScore: 100, status: "ATTENTION", issues: [issue] });
  mocks.db.healthIssue.findFirst.mockResolvedValue(null); mocks.db.healthIssue.create.mockResolvedValue({ id: "issue" }); mocks.db.healthIssue.update.mockResolvedValue({ id: "existing" }); mocks.db.healthIssue.findMany.mockResolvedValue([]);
  mocks.generate.mockResolvedValue({ summary: "Summary", explanation: "Evidence", recommendedActions: [] }); mocks.db.syncJob.findMany.mockResolvedValue([]);
  mocks.db.syncJob.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.useRealTimers());
describe("health worker orchestration", () => {
  it("rebuilds metrics under the ingestion lock and uses the outlet's date", async () => {
    expect(await recalculateOutletHealth("org", "outlet")).toEqual({ id: "snapshot" });
    expect(mocks.rebuild).toHaveBeenCalledWith(expect.any(Object), "org", "outlet");
    expect(mocks.lock.mock.calls[0][1]).toBe("org");
    expect(mocks.db.dailyOutletMetric.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org", outletId: "outlet", metricDate: { lte: new Date("2026-09-17"), gte: new Date("2026-07-20") } });
    expect(mocks.db.outletHealthSnapshot.upsert.mock.calls[0][0]).toMatchObject({ where: { outletId_snapshotDate: { outletId: "outlet", snapshotDate: new Date("2026-09-17") } }, create: { organizationId: "org", overallScore: 70 } });
  });
  it("fills missing calendar dates and keeps comparison windows separate", async () => {
    await recalculateOutletHealth("org", "outlet", new Date("2026-09-17T00:00:00Z"));
    const input = mocks.evaluate.mock.calls[0][0];
    expect(input.trailing7).toHaveLength(7); expect(input.prior7).toHaveLength(7); expect(input.trailing30).toHaveLength(30); expect(input.prior30).toHaveLength(30);
    expect(input.trailing7[0]).toMatchObject({ metricDate: "2026-09-17", netSales: 90 });
    expect(input.trailing7[1]).toMatchObject({ metricDate: "2026-09-16", netSales: 0 });
    expect(input.prior7[0].metricDate).toBe("2026-09-10");
  });
  it.each([[], [metric({ costComplete: false })], [metric({ opexComplete: false })]].map(metrics => ({ metrics })))("does not score incomplete metrics %j", async ({ metrics }) => {
    mocks.db.dailyOutletMetric.findMany.mockResolvedValue(metrics);
    expect(await recalculateOutletHealth("org", "outlet")).toBeNull(); expect(mocks.db.outletHealthSnapshot.upsert).not.toHaveBeenCalled();
  });
  it("creates issues with tenant context and removes only obsolete issues for this snapshot", async () => {
    await recalculateOutletHealth("org", "outlet");
    expect(mocks.db.healthIssue.create).toHaveBeenCalledWith({ data: { ...issue, organizationId: "org", outletId: "outlet", snapshotId: "snapshot" } });
    expect(mocks.db.healthIssue.deleteMany).toHaveBeenCalledWith({ where: { snapshotId: "snapshot", id: { notIn: ["issue"] } } });
  });
  it("updates existing issues instead of duplicating them", async () => {
    mocks.db.healthIssue.findFirst.mockResolvedValue({ id: "existing" }); await recalculateOutletHealth("org", "outlet");
    expect(mocks.db.healthIssue.create).not.toHaveBeenCalled(); expect(mocks.db.healthIssue.update.mock.calls[0][0].where).toEqual({ id: "existing" });
  });
});
describe("insight worker contract", () => {
  it("only considers open issues without existing insights in this organization", async () => {
    expect(await generatePendingInsights("org")).toBe(0);
    expect(mocks.db.healthIssue.findMany).toHaveBeenCalledWith({ where: { organizationId: "org", status: "OPEN", insights: { none: {} } }, include: { outlet: true }, take: 25 });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each([true, false])("maps evidence and persists results (optional metrics present=%s)", async present => {
    mocks.db.healthIssue.findMany.mockResolvedValue([{ ...issue, id: "issue", outletId: "outlet", outlet: { name: "Outlet A" }, ...(!present ? { currentValue: null, previousValue: null, targetValue: null, financialImpactEstimate: null } : {}) }]);
    expect(await generatePendingInsights("org")).toBe(1);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ outlet: "Outlet A", currentValue: present ? 44 : undefined, estimatedImpact: present ? 100 : undefined });
    expect(mocks.db.insight.create.mock.calls[0][0].data).toMatchObject({ organizationId: "org", healthIssueId: "issue", outletId: "outlet", modelProvider: "rules", modelName: "deterministic-guidance-v1" });
  });
  it("does not persist a success when the insight provider fails", async () => {
    mocks.db.healthIssue.findMany.mockResolvedValue([{ ...issue, outlet: { name: "A" } }]); mocks.generate.mockRejectedValue(Error("provider failed"));
    await expect(generatePendingInsights("org")).rejects.toThrow("provider failed"); expect(mocks.db.insight.create).not.toHaveBeenCalled();
  });
});
describe("queued sync jobs", () => {
  it("does nothing when there are no jobs", async () => { await processQueuedJobs(); expect(mocks.db.syncJob.update).not.toHaveBeenCalled(); });
  it("transitions queued jobs through RUNNING to COMPLETED", async () => {
    mocks.db.syncJob.findMany.mockResolvedValue([{ id: "job", organizationId: "org" }]);
    await processQueuedJobs();
    expect(mocks.db.syncJob.updateMany).toHaveBeenCalledWith({ where: { id: "job", status: "QUEUED" }, data: { status: "RUNNING", startedAt: expect.any(Date) } });
    expect(mocks.db.syncJob.update).toHaveBeenCalledWith({ where: { id: "job" }, data: { status: "COMPLETED", completedAt: expect.any(Date), recordsProcessed: 1 } });
    expect(mocks.db.outlet.findMany).toHaveBeenCalledWith({ where: { organizationId: "org" } });
  });
  it("skips a job claimed by another worker", async () => {
    mocks.db.syncJob.findMany.mockResolvedValue([{ id: "job", organizationId: "org" }]);
    mocks.db.syncJob.updateMany.mockResolvedValue({ count: 0 });
    await processQueuedJobs();
    expect(mocks.db.outlet.findMany).not.toHaveBeenCalled();
    expect(mocks.db.syncJob.update).not.toHaveBeenCalled();
  });
  it.each([Error("database failed"), "unknown failure"])("records failure and continues with later jobs: %s", async error => {
    mocks.db.syncJob.findMany.mockResolvedValue([{ id: "bad", organizationId: "org" }, { id: "good", organizationId: "other" }]);
    mocks.db.outlet.findMany.mockRejectedValueOnce(error).mockResolvedValueOnce([]);
    await processQueuedJobs();
    expect(mocks.db.syncJob.update).toHaveBeenCalledWith({ where: { id: "bad" }, data: { status: "FAILED", completedAt: expect.any(Date), errorMessage: error instanceof Error ? error.message : "Unknown error" } });
    expect(mocks.db.syncJob.update).toHaveBeenLastCalledWith({ where: { id: "good" }, data: { status: "COMPLETED", completedAt: expect.any(Date), recordsProcessed: 0 } });
  });
});
