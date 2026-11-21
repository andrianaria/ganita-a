import { prisma, businessDate, normalizeStoredTimezone } from "@ganita-ai/database";
import { evaluateOutletHealth, policyFromSettings } from "@ganita-ai/health-engine";

export async function dashboardData(organizationId: string, query: { outletId?: string; from?: string; to?: string }) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const outlets = await prisma.outlet.findMany({ where: { organizationId, id: query.outletId }, orderBy: { name: "asc" } });
  if (query.outletId && !outlets.length) throw Object.assign(new Error("Outlet tidak tersedia."), { statusCode: 404 });
  const to = query.to ?? businessDate(new Date(), outlets.length === 1 ? outlets[0].timezone : org.timezone);
  const from = query.from ?? new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw Object.assign(new Error("Rentang tanggal maksimal 366 hari dan harus berurutan."), { statusCode: 400 });
  const allMetrics = await prisma.dailyOutletMetric.findMany({ where: { organizationId, outletId: query.outletId, metricDate: { gte: new Date(Date.parse(from) - 60 * 86400000), lte: new Date(to) } }, orderBy: { metricDate: "asc" } });
  const metrics = allMetrics.filter(m => m.metricDate.toISOString().slice(0, 10) >= from);
  const summarize = (rows: typeof metrics) => {
    const sum = (key: "netSales" | "grossSales" | "cogs" | "opex" | "transactionCount" | "discountAmount") => rows.reduce((n, m) => n + Number(m[key]), 0);
    const sales = sum("netSales"), count = sum("transactionCount");
    const costComplete = rows.length > 0 && rows.every(m => m.costComplete);
    const opexComplete = rows.length > 0 && rows.every(m => m.opexComplete);
    return { netSales: sales, grossSales: sum("grossSales"), transactionCount: count, averageOrderValue: count ? sales / count : 0, discountAmount: sum("discountAmount"),
      cogs: costComplete ? sum("cogs") : null, opex: opexComplete ? sum("opex") : null, grossProfit: costComplete ? sales - sum("cogs") : null,
      netProfit: costComplete && opexComplete ? sales - sum("cogs") - sum("opex") : null, foodCost: costComplete && sales > 0 ? sum("cogs") / sales * 100 : null,
      margin: costComplete && sales > 0 ? (sales - sum("cogs")) / sales * 100 : null, costComplete, opexComplete };
  };
  const outletData = outlets.map(outlet => {
    const rows = metrics.filter(m => m.outletId === outlet.id);
    const summary = summarize(rows);
    const trailing = allMetrics.filter(m => m.outletId === outlet.id && m.metricDate.getTime() > Date.parse(to) - 60 * 86400000);
    let health = null;
    if (trailing.length && trailing.every(m => m.costComplete && m.opexComplete) && rows.some(m => m.netSales.toNumber() > 0)) {
      const days = Array.from({ length: 60 }, (_, i) => {
        const date = new Date(Date.parse(to) - i * 86400000).toISOString().slice(0, 10);
        const m = trailing.find(m => m.metricDate.toISOString().slice(0, 10) === date);
        return { outletId: outlet.id, metricDate: date, grossSales: Number(m?.grossSales ?? 0), netSales: Number(m?.netSales ?? 0), transactionCount: m?.transactionCount ?? 0,
          averageOrderValue: Number(m?.averageOrderValue ?? 0), cogs: Number(m?.cogs ?? 0), hppPercentage: Number(m?.hppPercentage ?? 0), opex: Number(m?.opex ?? 0),
          opexPercentage: Number(m?.opexPercentage ?? 0), grossProfit: Number(m?.grossProfit ?? 0), grossMarginPercentage: Number(m?.grossMarginPercentage ?? 0),
          discountAmount: Number(m?.discountAmount ?? 0), discountPercentage: Number(m?.discountPercentage ?? 0) };
      });
      if (days.slice(0, 7).some(m => m.transactionCount > 0)) health = evaluateOutletHealth({ trailing7: days.slice(0, 7), prior7: days.slice(7, 14), trailing30: days.slice(0, 30), prior30: days.slice(30, 60) }, policyFromSettings(org.settings));
    }
    return { id: outlet.id, name: outlet.name, code: outlet.code, timezone: normalizeStoredTimezone(outlet.timezone), ...summary, health, score: health?.overallScore ?? null,
      lastUpdatedAt: rows.length ? new Date(Math.max(...rows.map(m => m.updatedAt.getTime()))).toISOString() : null };
  });
  const balances = await prisma.stockBalance.findMany({ where: { organizationId, stockLocation: { organizationId, outletId: query.outletId } }, include: { ingredient: true, stockLocation: true } });
  const products = await prisma.product.findMany({ where: { organizationId, ...(query.outletId ? { OR: [{ brandId: outlets[0].brandId }, { transactionItems: { some: { organizationId, outletId: query.outletId } } }] } : {}) }, orderBy: { name: "asc" }, take: 500 });
  const scores = outletData.map(o => o.score).filter((n): n is number => n !== null);
  return { from, to, currency: org.currency, timezone: normalizeStoredTimezone(query.outletId ? outlets[0].timezone : org.timezone), summary: summarize(metrics), outlets: outletData,
    organizationScore: scores.length === outletData.length && scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    metrics: metrics.map(m => ({ outletId: m.outletId, date: m.metricDate.toISOString().slice(0, 10), netSales: Number(m.netSales), transactionCount: m.transactionCount })),
    products: products.map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, active: p.active, sellingPrice: p.sellingPrice == null ? null : Number(p.sellingPrice), estimatedCost: p.estimatedCost == null ? null : Number(p.estimatedCost) })),
    balances: balances.filter(b => b.ingredient.organizationId === organizationId).map(b => ({ id: b.id, name: b.ingredient.name, location: b.stockLocation.name, onHand: Number(b.onHandQuantity), unit: b.unit, reorderPoint: b.reorderPoint == null ? null : Number(b.reorderPoint) })),
    generatedAt: new Date().toISOString() };
}
