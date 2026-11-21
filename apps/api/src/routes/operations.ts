import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Prisma, rebuildOutletMetrics } from "@ganita-ai/database";
import { requireAuth } from "../auth.js";
import { assertTenantReferences } from "../tenant.js";
import { dashboardData } from "../dashboard.js";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const outletQuery = z.object({ outletId: z.string().uuid().optional() });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function stockRisks(organizationId: string, outletId?: string) {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const settings = organization.settings as { targets?: { stockDays?: string; waste?: string } };
  const balances = await prisma.stockBalance.findMany({ where: { organizationId, stockLocation: { outletId } }, include: { ingredient: true, stockLocation: true } });
  const movements = await prisma.stockMovement.findMany({ where: { organizationId, stockLocation: { outletId }, occurredAt: { gte: new Date(Date.now() - 7 * 86400000), lte: new Date() }, type: { in: ["SALE_USAGE", "WASTE"] } } });
  return balances.map(balance => {
    const rows = movements.filter(m => m.ingredientId === balance.ingredientId && m.stockLocationId === balance.stockLocationId && m.unit === balance.unit);
    const usage = rows.filter(m => m.type === "SALE_USAGE").reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
    const waste = rows.filter(m => m.type === "WASTE").reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
    const available = Number(balance.onHandQuantity) - Number(balance.reservedQuantity);
    const coverageDays = usage > 0 ? available / (usage / 7) : null;
    const wastePercentage = usage + waste > 0 ? waste / (usage + waste) * 100 : null;
    return { ingredient: balance.ingredient.name, location: balance.stockLocation.name, outletId: balance.stockLocation.outletId, available, unit: balance.unit, coverageDays, wastePercentage,
      lowStock: available <= Number(balance.reorderPoint ?? 0) || (coverageDays !== null && coverageDays < Number(settings.targets?.stockDays ?? 4)),
      highWaste: wastePercentage !== null && wastePercentage > Number(settings.targets?.waste ?? 5) };
  });
}

export async function operationsRoutes(app: FastifyInstance) {
  app.get("/v1/alerts", { preHandler: requireAuth }, async request => {
    const query = outletQuery.parse(request.query), organizationId = request.userContext!.organizationId;
    const data = await dashboardData(organizationId, query);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const preferences = (org.settings as { notifications?: { health?: boolean; stock?: boolean; sales?: boolean } }).notifications;
    const issues = data.outlets.flatMap(outlet => (outlet.health?.issues ?? []).filter(issue => issue.type === "SALES_DECLINE" ? preferences?.sales !== false : preferences?.health !== false).map(issue => ({ outlet: outlet.name, type: issue.type, currentValue: issue.currentValue, targetValue: issue.targetValue })));
    const risks = preferences?.stock === false ? [] : await stockRisks(organizationId, query.outletId);
    return { data: [...issues, ...risks.filter(r => r.lowStock || r.highWaste).map(r => ({ outlet: r.location, type: r.highWaste ? "HIGH_WASTE" : "LOW_STOCK", ingredient: r.ingredient }))] };
  });
  app.get("/v1/expenses", { preHandler: requireAuth }, async request => {
    const query = outletQuery.parse(request.query);
    return { data: await prisma.expense.findMany({ where: { organizationId: request.userContext!.organizationId, outletId: query.outletId }, orderBy: { expenseDate: "desc" }, take: 100 }) };
  });
  app.post("/v1/expenses", { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ id: z.string().uuid(), outletId: z.string().uuid(), expenseDate: date, amount: z.number().finite().nonnegative(), description: z.string().trim().min(1).max(1000), category: z.enum(["RENT", "SALARY", "UTILITY", "MARKETING", "DELIVERY_PLATFORM", "MAINTENANCE", "SUPPLIES", "OTHER"]) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    await assertTenantReferences(organizationId, body);
    const expense = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const existing = await tx.expense.findUnique({ where: { id: body.id } });
      if (existing) {
        if (existing.organizationId !== organizationId || existing.outletId !== body.outletId || Number(existing.amount) !== body.amount || existing.expenseDate.toISOString().slice(0, 10) !== body.expenseDate || existing.category !== body.category || existing.description !== body.description) throw Object.assign(new Error("ID biaya sudah digunakan."), { statusCode: 409 });
        return existing;
      }
      const row = await tx.expense.create({ data: { ...body, organizationId, expenseDate: new Date(body.expenseDate) } });
      await rebuildOutletMetrics(tx, organizationId, body.outletId);
      return row;
    }, { timeout: 60000 });
    return reply.code(201).send({ data: expense });
  });
  app.delete("/v1/expenses/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const organizationId = request.userContext!.organizationId;
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const expense = await tx.expense.delete({ where: { id, organizationId } });
      await rebuildOutletMetrics(tx, organizationId, expense.outletId);
    }, { timeout: 60000 });
    return { data: { deleted: true } };
  });
  app.post("/v1/inspections", { preHandler: requireAuth }, async (request, reply) => {
    const query = outletQuery.parse(request.body), organizationId = request.userContext!.organizationId;
    const dashboard = await dashboardData(organizationId, query);
    const risks = await stockRisks(organizationId, query.outletId);
    const inspection = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      if (query.outletId) await tx.outlet.findFirstOrThrow({ where: { id: query.outletId, organizationId } });
      return tx.inspection.create({ data: { organizationId, outletId: query.outletId, result: json({ ...dashboard, inventoryRisks: risks, engine: "rules-v1", inspectedBy: request.userContext!.userId }) } });
    });
    return reply.code(201).send({ data: inspection });
  });
  app.get("/v1/inspections", { preHandler: requireAuth }, async request => {
    const { outletId } = outletQuery.parse(request.query);
    return { data: await prisma.inspection.findMany({ where: { organizationId: request.userContext!.organizationId, outletId }, orderBy: { createdAt: "desc" }, take: 50 }) };
  });
  app.get("/v1/treatments", { preHandler: requireAuth }, async request => {
    const { outletId } = outletQuery.parse(request.query);
    return { data: await prisma.treatment.findMany({ where: { organizationId: request.userContext!.organizationId, outletId }, orderBy: { createdAt: "desc" }, take: 100 }) };
  });
  app.post("/v1/treatments", { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ outletId: z.string().uuid(), title: z.string().trim().min(1).max(500) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    const baseline = await dashboardData(organizationId, { outletId: body.outletId });
    const treatment = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      await tx.outlet.findFirstOrThrow({ where: { id: body.outletId, organizationId } });
      return tx.treatment.create({ data: { ...body, organizationId, baseline: json({ from: baseline.from, to: baseline.to, summary: baseline.summary, score: baseline.organizationScore }) } });
    });
    return reply.code(201).send({ data: treatment });
  });
  app.patch("/v1/treatments/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]), resultNote: z.string().trim().min(1).max(2000) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    const current = await prisma.treatment.findFirstOrThrow({ where: { id, organizationId } });
    if (["COMPLETED", "CANCELLED"].includes(current.status)) throw Object.assign(new Error("Tindakan sudah ditutup."), { statusCode: 409 });
    const after = await dashboardData(organizationId, { outletId: current.outletId });
    const updated = await prisma.treatment.updateMany({ where: { id, organizationId, status: current.status }, data: { ...body,
      completedAt: body.status === "COMPLETED" ? new Date() : null,
      outcome: body.status === "COMPLETED" ? json({ from: after.from, to: after.to, summary: after.summary, score: after.organizationScore }) : undefined } });
    if (!updated.count) throw Object.assign(new Error("Tindakan berubah. Muat ulang."), { statusCode: 409 });
    return { data: await prisma.treatment.findUniqueOrThrow({ where: { id, organizationId } }) };
  });
  app.get("/v1/reports/export", { preHandler: requireAuth }, async (request, reply) => {
    const query = outletQuery.extend({ from: date.optional(), to: date.optional(), format: z.enum(["pdf", "xlsx"]), language: z.enum(["id", "en"]).default("id") }).parse(request.query);
    const data = await dashboardData(request.userContext!.organizationId, query);
    const t = (id: string, en: string) => query.language === "id" ? id : en;
    const columns = [t("Outlet", "Outlet"), t("Penjualan bersih", "Net sales"), t("Biaya bahan", "COGS"), t("Biaya operasional", "OPEX"), t("Laba bersih", "Net profit"), t("Skor kesehatan", "Health score")];
    const rows = data.outlets.map(o => [o.name, o.netSales, o.cogs, o.opex, o.netProfit, o.score]);
    const filename = `ganita-${data.from}-${data.to}.${query.format}`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`).header("Cache-Control", "no-store");
    if (query.format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ganita";
      const sheet = workbook.addWorksheet(t("Ringkasan", "Summary"));
      sheet.addRow([`Ganita | ${data.from} - ${data.to} | ${data.currency}`]);
      sheet.addRow([t("Kosong berarti data belum lengkap, bukan nol.", "Blank means incomplete data, not zero.")]);
      sheet.addRow(columns); sheet.addRows(rows);
      sheet.columns.forEach((column, index) => { column.width = index ? 22 : 40; if (index) column.numFmt = "#,##0.00"; });
      sheet.getRow(3).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 3 }];
      const daily = workbook.addWorksheet(t("Harian", "Daily"));
      daily.addRow(["Outlet ID", t("Tanggal", "Date"), t("Penjualan bersih", "Net sales"), t("Transaksi", "Transactions")]);
      data.metrics.forEach(m => daily.addRow([m.outletId, m.date, m.netSales, m.transactionCount]));
      daily.columns.forEach(c => { c.width = 25; });
      return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(Buffer.from(await workbook.xlsx.writeBuffer()));
    }
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
    let page = doc.addPage([842, 595]), y = 550;
    const line = (text: string, size = 11) => {
      if (y < 40) { page = doc.addPage([842, 595]); y = 550; }
      const safe = text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
      page.drawText(safe, { x: 36, y, size, font, color: rgb(.08, .22, .18), maxWidth: 765 }); y -= size + 12;
    };
    line(t("Laporan kesehatan outlet Ganita", "Ganita outlet health report"), 20);
    line(`${data.from} - ${data.to} | ${data.currency} | ${data.timezone}`);
    line(t("N/A: data belum lengkap. Skor bukan pengganti pemeriksaan operasional.", "N/A: incomplete data. Scores do not replace operational review."));
    for (const row of rows) { line(String(row[0]).slice(0, 90), 14); for (let i = 1; i < columns.length; i++) line(`${columns[i]}: ${row[i] === null ? "N/A" : Number(row[i]).toLocaleString(query.language === "id" ? "id-ID" : "en-US")}`); }
    return reply.type("application/pdf").send(Buffer.from(await doc.save()));
  });
}
