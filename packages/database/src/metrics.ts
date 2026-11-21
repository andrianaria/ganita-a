import type { Prisma } from "@prisma/client";

// Older onboarding saved option labels instead of IANA identifiers. Do not guess other zones.
export function normalizeStoredTimezone(timezone: string) {
  const legacy: Record<string, string> = {
    "Asia/Jakarta (GMT+7)": "Asia/Jakarta",
    "Asia/Makassar (GMT+8)": "Asia/Makassar",
    "Asia/Jayapura (GMT+9)": "Asia/Jayapura",
  };
  return Object.hasOwn(legacy, timezone) ? legacy[timezone] : timezone;
}

export function businessDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: normalizeStoredTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

type Sale = { occurredAt: Date; status: string; grossSales: unknown; netSales: unknown; discountAmount: unknown; totalCost: unknown;
  transactionItems: Array<{ totalCost: unknown; unitCost: unknown; quantity: unknown }> };
type Expense = { expenseDate: Date; amount: unknown };
const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const percent = (a: number, b: number) => b > 0 ? round(a / b * 100) : 0;

export function aggregateDaily(sales: Sale[], expenses: Expense[], timezone: string) {
  const days = new Map<string, { grossSales: number; netSales: number; discountAmount: number; transactionCount: number; cogs: number; opex: number; costComplete: boolean; opexComplete: boolean }>();
  const day = (key: string) => {
    if (!days.has(key)) days.set(key, { grossSales: 0, netSales: 0, discountAmount: 0, transactionCount: 0, cogs: 0, opex: 0, costComplete: true, opexComplete: false });
    return days.get(key)!;
  };
  for (const sale of sales) {
    if (!["PAID", "COMPLETED"].includes(sale.status.toUpperCase())) continue;
    const target = day(businessDate(sale.occurredAt, timezone));
    target.grossSales += Number(sale.grossSales);
    target.netSales += Number(sale.netSales);
    target.discountAmount += Number(sale.discountAmount);
    target.transactionCount++;
    if (sale.totalCost != null) target.cogs += Number(sale.totalCost);
    else if (sale.transactionItems.length && sale.transactionItems.every(i => i.totalCost != null || i.unitCost != null)) {
      target.cogs += sale.transactionItems.reduce((sum, i) => sum + (i.totalCost != null ? Number(i.totalCost) : Number(i.unitCost) * Number(i.quantity)), 0);
    } else target.costComplete = false;
  }
  for (const expense of expenses) {
    const target = day(expense.expenseDate.toISOString().slice(0, 10));
    target.opex += Number(expense.amount);
    target.opexComplete = true;
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
    ...d, metricDate: new Date(`${date}T00:00:00Z`), grossSales: round(d.grossSales), netSales: round(d.netSales), discountAmount: round(d.discountAmount), cogs: round(d.cogs), opex: round(d.opex),
    averageOrderValue: d.transactionCount ? round(d.netSales / d.transactionCount) : 0,
    hppPercentage: percent(d.cogs, d.netSales), opexPercentage: percent(d.opex, d.netSales),
    grossProfit: round(d.netSales - d.cogs), grossMarginPercentage: percent(d.netSales - d.cogs, d.netSales), discountPercentage: percent(d.discountAmount, d.grossSales),
  }));
}

// The caller holds the organization ingestion lock; rebuild also removes days made obsolete by corrections/voids.
export async function rebuildOutletMetrics(tx: Prisma.TransactionClient, organizationId: string, outletId: string) {
  const outlet = await tx.outlet.findFirstOrThrow({ where: { id: outletId, organizationId } });
  const sales = await tx.transaction.findMany({ where: { organizationId, outletId }, include: { transactionItems: true } });
  const expenses = await tx.expense.findMany({ where: { organizationId, outletId } });
  const metrics = aggregateDaily(sales, expenses, outlet.timezone);
  await tx.dailyOutletMetric.deleteMany({ where: { organizationId, outletId } });
  if (metrics.length) await tx.dailyOutletMetric.createMany({ data: metrics.map(m => ({ ...m, organizationId, outletId })) });
  return metrics.length;
}
