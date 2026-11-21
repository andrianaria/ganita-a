import { prisma, rebuildOutletMetrics, businessDate } from "@ganita-ai/database";
import { loadConfig } from "@ganita-ai/config";
import { evaluateOutletHealth, policyFromSettings } from "@ganita-ai/health-engine";
import { MockInsightProvider } from "@ganita-ai/insights";
import type { DailyOutletMetricInput } from "@ganita-ai/types";

const config = loadConfig();
const insightProvider = new MockInsightProvider();

function toMetricInput(metric: {
  outletId: string;
  metricDate: Date;
  grossSales: unknown;
  netSales: unknown;
  transactionCount: number;
  averageOrderValue: unknown;
  cogs: unknown;
  hppPercentage: unknown;
  opex: unknown;
  opexPercentage: unknown;
  grossProfit: unknown;
  grossMarginPercentage: unknown;
  discountAmount: unknown;
  discountPercentage: unknown;
}): DailyOutletMetricInput {
  return {
    outletId: metric.outletId,
    metricDate: metric.metricDate.toISOString().slice(0, 10),
    grossSales: Number(metric.grossSales),
    netSales: Number(metric.netSales),
    transactionCount: metric.transactionCount,
    averageOrderValue: Number(metric.averageOrderValue),
    cogs: Number(metric.cogs),
    hppPercentage: Number(metric.hppPercentage),
    opex: Number(metric.opex),
    opexPercentage: Number(metric.opexPercentage),
    grossProfit: Number(metric.grossProfit),
    grossMarginPercentage: Number(metric.grossMarginPercentage),
    discountAmount: Number(metric.discountAmount),
    discountPercentage: Number(metric.discountPercentage)
  };
}

export async function recalculateOutletHealth(organizationId: string, outletId: string, snapshotDate = new Date()) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    await rebuildOutletMetrics(tx, organizationId, outletId);
  }, { timeout: 60000 });
  const outlet = await prisma.outlet.findFirstOrThrow({ where: { organizationId, id: outletId }, include: { organization: true } });
  snapshotDate = new Date(`${businessDate(snapshotDate, outlet.timezone)}T00:00:00Z`);
  const metrics = await prisma.dailyOutletMetric.findMany({
    where: { organizationId, outletId, metricDate: { lte: snapshotDate, gte: new Date(snapshotDate.getTime() - 59 * 86400000) } },
    orderBy: { metricDate: "desc" },
    take: 60
  });

  if (!metrics.length || metrics.some(m => !m.costComplete || !m.opexComplete)) return null;

  const byDate = new Map(metrics.map(m => [m.metricDate.toISOString().slice(0, 10), toMetricInput(m)]));
  const ordered = Array.from({ length: 60 }, (_, index) => {
    const metricDate = new Date(snapshotDate.getTime() - index * 86400000).toISOString().slice(0, 10);
    return byDate.get(metricDate) ?? { outletId, metricDate, grossSales: 0, netSales: 0, transactionCount: 0, averageOrderValue: 0, cogs: 0, hppPercentage: 0, opex: 0, opexPercentage: 0, grossProfit: 0, grossMarginPercentage: 0, discountAmount: 0, discountPercentage: 0 };
  });
  const result = evaluateOutletHealth({
    trailing7: ordered.slice(0, 7),
    prior7: ordered.slice(7, 14),
    trailing30: ordered.slice(0, 30),
    prior30: ordered.slice(30, 60)
  }, policyFromSettings(outlet.organization?.settings));

  const snapshot = await prisma.outletHealthSnapshot.upsert({
    where: { outletId_snapshotDate: { outletId, snapshotDate } },
    update: {
      healthPolicyVersion: result.healthPolicyVersion,
      overallScore: result.overallScore,
      revenueScore: result.revenueScore,
      marginScore: result.marginScore,
      costScore: result.costScore,
      operationsScore: result.operationsScore,
      status: result.status
    },
    create: {
      organizationId,
      outletId,
      snapshotDate,
      healthPolicyVersion: result.healthPolicyVersion,
      overallScore: result.overallScore,
      revenueScore: result.revenueScore,
      marginScore: result.marginScore,
      costScore: result.costScore,
      operationsScore: result.operationsScore,
      status: result.status
    }
  });

  const activeIssueIds: string[] = [];
  for (const issue of result.issues) {
    const existing = await prisma.healthIssue.findFirst({ where: { snapshotId: snapshot.id, type: issue.type, metricName: issue.metricName } });
    const saved = existing
      ? await prisma.healthIssue.update({
          where: { id: existing.id },
          data: {
            severity: issue.severity,
            title: issue.title,
            description: issue.description,
            currentValue: issue.currentValue,
            previousValue: issue.previousValue,
            targetValue: issue.targetValue,
            financialImpactEstimate: issue.financialImpactEstimate,
          },
        })
      : await prisma.healthIssue.create({
          data: {
        organizationId,
        outletId,
        snapshotId: snapshot.id,
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        metricName: issue.metricName,
        currentValue: issue.currentValue,
        previousValue: issue.previousValue,
        targetValue: issue.targetValue,
        financialImpactEstimate: issue.financialImpactEstimate
          },
        });
    activeIssueIds.push(saved.id);
  }
  await prisma.healthIssue.deleteMany({ where: { snapshotId: snapshot.id, id: { notIn: activeIssueIds } } });

  return snapshot;
}

export async function generatePendingInsights(organizationId: string) {
  const issues = await prisma.healthIssue.findMany({
    where: { organizationId, status: "OPEN", insights: { none: {} } },
    include: { outlet: true },
    take: 25
  });

  for (const issue of issues) {
    const insight = await insightProvider.generateInsight({
      outlet: issue.outlet.name,
      issueType: issue.type,
      metricName: issue.metricName,
      currentValue: issue.currentValue ? Number(issue.currentValue) : undefined,
      previousValue: issue.previousValue ? Number(issue.previousValue) : undefined,
      targetValue: issue.targetValue ? Number(issue.targetValue) : undefined,
      estimatedImpact: issue.financialImpactEstimate ? Number(issue.financialImpactEstimate) : undefined
    });

    await prisma.insight.create({
      data: {
        organizationId,
        outletId: issue.outletId,
        healthIssueId: issue.id,
        summary: insight.summary,
        explanation: insight.explanation,
        recommendedActionsJson: insight.recommendedActions,
        modelProvider: "rules",
        modelName: "deterministic-guidance-v1",
        promptVersion: "mvp-v1"
      }
    });
  }

  return issues.length;
}

export async function processQueuedJobs() {
  const jobs = await prisma.syncJob.findMany({ where: { status: "QUEUED", type: { not: "TRANSACTION_IMPORT" } }, take: 10, orderBy: { createdAt: "asc" } });
  for (const job of jobs) {
    const claimed = await prisma.syncJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
    if (claimed.count !== 1) continue;
    try {
      const outlets = await prisma.outlet.findMany({ where: { organizationId: job.organizationId } });
      for (const outlet of outlets) {
        await recalculateOutletHealth(job.organizationId, outlet.id);
      }
      await generatePendingInsights(job.organizationId);
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date(), recordsProcessed: outlets.length }
      });
    } catch (error) {
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown error" }
      });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ service: "ganita-ai-worker", mode: "poll", env: config.APP_ENV }));
  const poll = async () => {
    try {
      await processQueuedJobs();
    } catch (error) {
      console.error(error);
    }
    setTimeout(() => void poll(), 5000);
  };
  await poll();
}
