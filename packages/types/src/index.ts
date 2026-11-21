export type ID = string;

export type MoneyString = string;

export type HealthStatus = "HEALTHY" | "ATTENTION" | "WARNING" | "CRITICAL";

export type IssueSeverity = "INFO" | "WARNING" | "CRITICAL";

export type IssueType =
  | "HIGH_HPP"
  | "HIGH_OPEX"
  | "SALES_DECLINE"
  | "EXCESSIVE_DISCOUNT"
  | "MARGIN_DECLINE"
  | "HIGH_LABOR_COST"
  | "INVENTORY_ANOMALY"
  | "LOW_AVERAGE_ORDER";

export interface DailyOutletMetricInput {
  outletId: ID;
  metricDate: string;
  grossSales: number;
  netSales: number;
  transactionCount: number;
  averageOrderValue: number;
  cogs: number;
  hppPercentage: number;
  opex: number;
  opexPercentage: number;
  grossProfit: number;
  grossMarginPercentage: number;
  discountAmount: number;
  discountPercentage: number;
}
