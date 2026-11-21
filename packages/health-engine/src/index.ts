import { percentage, round } from "@ganita-ai/shared";
import type { DailyOutletMetricInput, HealthStatus, IssueSeverity, IssueType } from "@ganita-ai/types";
import { mvpHealthPolicy, type HealthPolicy } from "./policy.js";

export interface HealthIssueResult {
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  metricName: string;
  currentValue?: number;
  previousValue?: number;
  targetValue?: number;
  financialImpactEstimate?: number;
}

export interface HealthSnapshotResult {
  healthPolicyVersion: string;
  overallScore: number;
  revenueScore: number;
  marginScore: number;
  costScore: number;
  operationsScore: number;
  status: HealthStatus;
  issues: HealthIssueResult[];
}

export interface HealthInput {
  trailing7: DailyOutletMetricInput[];
  prior7: DailyOutletMetricInput[];
  trailing30: DailyOutletMetricInput[];
  prior30: DailyOutletMetricInput[];
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function hppScore(hpp: number) {
  if (hpp < 32) return 100;
  if (hpp < 35) return 85;
  if (hpp < 38) return 65;
  if (hpp <= 40) return 40;
  return 20;
}

function opexScore(opexPercentage: number, target: number) {
  if (opexPercentage <= target * 0.75) return 100;
  if (opexPercentage <= target * 0.9) return 85;
  if (opexPercentage <= target) return 70;
  if (opexPercentage <= target * 1.15) return 45;
  return 25;
}

function declinePercentage(current: number, previous: number) {
  if (previous <= 0) return 0;
  return round(((previous - current) / previous) * 100, 4);
}

function statusForScore(score: number): HealthStatus {
  if (score >= 78) return "HEALTHY";
  if (score >= 60) return "ATTENTION";
  if (score >= 50) return "WARNING";
  return "CRITICAL";
}

export function calculateDailyMetric(params: {
  outletId: string;
  metricDate: string;
  grossSales: number;
  netSales: number;
  transactionCount: number;
  cogs: number;
  opex: number;
  discountAmount: number;
}): DailyOutletMetricInput {
  const grossProfit = params.netSales - params.cogs;

  return {
    outletId: params.outletId,
    metricDate: params.metricDate,
    grossSales: round(params.grossSales),
    netSales: round(params.netSales),
    transactionCount: params.transactionCount,
    averageOrderValue: round(params.netSales / Math.max(1, params.transactionCount)),
    cogs: round(params.cogs),
    hppPercentage: percentage(params.cogs, params.netSales),
    opex: round(params.opex),
    opexPercentage: percentage(params.opex, params.netSales),
    grossProfit: round(grossProfit),
    grossMarginPercentage: percentage(grossProfit, params.netSales),
    discountAmount: round(params.discountAmount),
    discountPercentage: percentage(params.discountAmount, params.grossSales)
  };
}

export function evaluateOutletHealth(input: HealthInput, policy: HealthPolicy = mvpHealthPolicy): HealthSnapshotResult {
  if (input.trailing7.length === 0) {
    return {
      healthPolicyVersion: policy.version,
      overallScore: 0,
      revenueScore: 0,
      marginScore: 0,
      costScore: 0,
      operationsScore: 0,
      status: "CRITICAL",
      issues: []
    };
  }

  const currentNetSales = sum(input.trailing7.map((metric) => metric.netSales));
  const priorNetSales = sum(input.prior7.map((metric) => metric.netSales));
  const current30NetSales = sum(input.trailing30.map((metric) => metric.netSales));
  const prior30NetSales = sum(input.prior30.map((metric) => metric.netSales));
  const ratio = (rows: DailyOutletMetricInput[], numerator: keyof DailyOutletMetricInput, denominator: keyof DailyOutletMetricInput) =>
    percentage(sum(rows.map(m => Number(m[numerator]))), sum(rows.map(m => Number(m[denominator]))));
  const hpp = ratio(input.trailing7, "cogs", "netSales");
  const previousHpp = ratio(input.prior7, "cogs", "netSales");
  const opex = ratio(input.trailing7, "opex", "netSales");
  const discount = ratio(input.trailing7, "discountAmount", "grossSales");
  const margin = ratio(input.trailing7, "grossProfit", "netSales");
  const previousMargin = ratio(input.prior7, "grossProfit", "netSales");
  const aov = currentNetSales / Math.max(1, sum(input.trailing7.map(m => m.transactionCount)));
  const previousAov = priorNetSales / Math.max(1, sum(input.prior7.map(m => m.transactionCount)));
  const salesDecline = declinePercentage(currentNetSales, priorNetSales);
  const salesDecline30 = declinePercentage(current30NetSales, prior30NetSales);
  const marginDecline = previousMargin - margin;
  const aovDecline = declinePercentage(aov, previousAov);

  const revenueScore = clampScore(100 - Math.max(salesDecline, salesDecline30, 0) * 2.5);
  const netMargin = margin - opex;
  const marginScore = Math.min(hppScore(hpp * 40 / policy.targets.hppPercentage),
    policy.targets.netMarginPercentage === undefined ? 100 : clampScore(100 - Math.max(policy.targets.netMarginPercentage - netMargin, 0) * 3));
  const costScore = opexScore(opex, policy.targets.opexPercentage);
  const operationsScore = clampScore(100 - Math.max(discount - policy.targets.discountPercentage, 0) * 4 - Math.max(aovDecline, 0) * 2);
  const overallScore = clampScore(
    revenueScore * policy.weights.revenue +
      marginScore * policy.weights.margin +
      costScore * policy.weights.cost +
      operationsScore * policy.weights.operations
  );

  const issues: HealthIssueResult[] = [];

  if (policy.targets.netMarginPercentage !== undefined && netMargin < policy.targets.netMarginPercentage) {
    issues.push({ type: "MARGIN_DECLINE", severity: netMargin < 0 ? "CRITICAL" : "WARNING",
      title: "Net margin is below target", description: "Net profit after recorded operating expenses is below the configured target.",
      metricName: "net_margin_percentage", currentValue: round(netMargin, 4), targetValue: policy.targets.netMarginPercentage });
  }

  if (hpp > policy.targets.hppPercentage) {
    issues.push({
      type: "HIGH_HPP",
      severity: hpp > policy.targets.hppPercentage + 2 ? "CRITICAL" : "WARNING",
      title: "HPP is above target",
      description: `HPP is ${round(hpp, 2)}%, above the ${policy.targets.hppPercentage}% target.`,
      metricName: "hpp_percentage",
      currentValue: round(hpp, 4),
      previousValue: round(previousHpp, 4),
      targetValue: policy.targets.hppPercentage,
      financialImpactEstimate: round(currentNetSales * ((hpp - policy.targets.hppPercentage) / 100))
    });
  }

  if (opex > policy.targets.opexPercentage) {
    issues.push({
      type: "HIGH_OPEX",
      severity: opex > policy.targets.opexPercentage + 5 ? "CRITICAL" : "WARNING",
      title: "OPEX ratio is above target",
      description: `OPEX is ${round(opex, 2)}%, above the ${policy.targets.opexPercentage}% target.`,
      metricName: "opex_percentage",
      currentValue: round(opex, 4),
      targetValue: policy.targets.opexPercentage,
      financialImpactEstimate: round(currentNetSales * ((opex - policy.targets.opexPercentage) / 100))
    });
  }

  if (salesDecline >= policy.targets.salesDeclinePercentage || salesDecline30 >= policy.targets.salesDeclinePercentage) {
    issues.push({
      type: "SALES_DECLINE",
      severity: Math.max(salesDecline, salesDecline30) > 25 ? "CRITICAL" : "WARNING",
      title: "Sales are declining",
      description: "Net sales have declined versus the comparable previous period.",
      metricName: "net_sales",
      currentValue: round(currentNetSales),
      previousValue: round(priorNetSales),
      targetValue: 0,
      financialImpactEstimate: round(Math.max(priorNetSales - currentNetSales, 0))
    });
  }

  if (discount > policy.targets.discountPercentage) {
    issues.push({
      type: "EXCESSIVE_DISCOUNT",
      severity: discount > policy.targets.discountPercentage + 5 ? "CRITICAL" : "WARNING",
      title: "Discounting is elevated",
      description: `Discount rate is ${round(discount, 2)}%, above the ${policy.targets.discountPercentage}% target.`,
      metricName: "discount_percentage",
      currentValue: round(discount, 4),
      targetValue: policy.targets.discountPercentage,
      financialImpactEstimate: round(currentNetSales * (discount / 100))
    });
  }

  if (input.prior7.length >= 7 && marginDecline >= policy.targets.marginDeclinePercentage) {
    issues.push({
      type: "MARGIN_DECLINE",
      severity: marginDecline > 10 ? "CRITICAL" : "WARNING",
      title: "Gross margin declined",
      description: "Gross margin deteriorated versus the previous 7-day period.",
      metricName: "gross_margin_percentage",
      currentValue: round(margin, 4),
      previousValue: round(previousMargin, 4),
      targetValue: round(previousMargin, 4)
    });
  }

  if (input.prior7.length >= 7 && aovDecline >= policy.targets.aovDeclinePercentage) {
    issues.push({
      type: "LOW_AVERAGE_ORDER",
      severity: aovDecline > 18 ? "CRITICAL" : "WARNING",
      title: "Average order value declined",
      description: "AOV is lower than the comparable previous period.",
      metricName: "average_order_value",
      currentValue: round(aov),
      previousValue: round(previousAov)
    });
  }

  return {
    healthPolicyVersion: policy.version,
    overallScore,
    revenueScore,
    marginScore,
    costScore,
    operationsScore,
    status: statusForScore(overallScore),
    issues
  };
}

export { mvpHealthPolicy, type HealthPolicy };
export { policyFromSettings } from "./policy.js";
