import { prisma, rebuildOutletMetrics, type Prisma } from "@ganita-ai/database";

export interface ImportTransaction {
  externalId: string; outletCode?: string; outletExternalId?: string; transactionNumber?: string; occurredAt: Date;
  grossSales: number; discountAmount: number; serviceCharge: number; taxAmount: number; netSales: number;
  totalCost?: number; paymentMethod?: string; status: string;
  items: Array<{ externalId?: string; productExternalId?: string; productName: string; quantity: number; unitPrice: number; grossAmount: number; discountAmount: number; netAmount: number; unitCost?: number; totalCost?: number }>;
}

export async function writeTransactions(tx: Prisma.TransactionClient, organizationId: string, dataSourceId: string, rows: ImportTransaction[]) {
  const touched = new Set<string>();
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const link = row.outletExternalId ? await tx.outletDataSource.findFirst({ where: { organizationId, dataSourceId, externalOutletId: row.outletExternalId }, include: { outlet: true } }) : null;
    const outlet = row.outletExternalId ? link?.outlet : await tx.outlet.findFirst({ where: { organizationId, code: row.outletCode } });
    if (!outlet || outlet.organizationId !== organizationId) throw Object.assign(new Error(`Outlet ${row.outletExternalId ?? row.outletCode} belum dipetakan.`), { statusCode: 400 });
    const key = JSON.stringify([outlet.id, row.externalId]);
    if (seen.has(key)) throw Object.assign(new Error(`Transaksi ${row.externalId} berulang dalam batch untuk outlet yang sama.`), { statusCode: 400 });
    seen.add(key);
    const total = (field: "grossAmount" | "netAmount" | "discountAmount") => row.items.reduce((n, i) => n + i[field], 0);
    if (Math.abs(total("netAmount") - row.netSales) > 1 || Math.abs(total("grossAmount") - row.grossSales) > 1 || Math.abs(total("discountAmount") - row.discountAmount) > 1) throw Object.assign(new Error(`Total item transaksi ${row.externalId} tidak sesuai dengan total transaksi.`), { statusCode: 400 });
    const where = { dataSourceId_outletId_externalId: { dataSourceId, outletId: outlet.id, externalId: row.externalId } };
    const existing = await tx.transaction.findUnique({ where });
    const values = { transactionNumber: row.transactionNumber, occurredAt: row.occurredAt, grossSales: row.grossSales, discountAmount: row.discountAmount,
      serviceCharge: row.serviceCharge, taxAmount: row.taxAmount, netSales: row.netSales, totalCost: row.totalCost ?? null, paymentMethod: row.paymentMethod, status: row.status.toUpperCase() };
    const transaction = await tx.transaction.upsert({ where, update: values, create: { ...values, organizationId, outletId: outlet.id, dataSourceId, externalId: row.externalId } });
    if (existing) updated++; else created++;
    await tx.transactionItem.deleteMany({ where: { transactionId: transaction.id, organizationId } });
    for (const item of row.items) {
      let productId: string | undefined;
      if (item.productExternalId) {
        const product = await tx.product.upsert({ where: { dataSourceId_externalId: { dataSourceId, externalId: item.productExternalId } },
          update: {}, create: { organizationId, dataSourceId, externalId: item.productExternalId, name: item.productName, sellingPrice: item.unitPrice, estimatedCost: item.unitCost } });
        if (product.organizationId !== organizationId) throw Object.assign(new Error("Produk tidak tersedia."), { statusCode: 403 });
        productId = product.id;
      }
      await tx.transactionItem.create({ data: { organizationId, outletId: outlet.id, transactionId: transaction.id, productId,
        externalId: item.externalId, productNameSnapshot: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, grossAmount: item.grossAmount,
        discountAmount: item.discountAmount, netAmount: item.netAmount, unitCost: item.unitCost, totalCost: item.totalCost } });
    }
    touched.add(outlet.id);
  }
  for (const outletId of touched) await rebuildOutletMetrics(tx, organizationId, outletId);
  await tx.dataSource.update({ where: { id: dataSourceId, organizationId }, data: { lastSyncAt: new Date(), status: "CONNECTED" } });
  await tx.syncJob.create({ data: { organizationId, dataSourceId, type: "TRANSACTION_IMPORT", status: "COMPLETED", startedAt: new Date(), completedAt: new Date(), recordsProcessed: rows.length } });
  return { created, updated, imported: rows.length, rejected: 0, status: "COMPLETED", sourceId: dataSourceId };
}

export async function ingestTransactions(organizationId: string, source: { id?: string; name?: string; type?: "CSV" | "OTHER" | "STREET_SUSHI_POS" | "GANITA_POS" }, rows: ImportTransaction[]) {
  return prisma.$transaction(async tx => {
    // Serialize imports per tenant, including source creation and replay, across API processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    let dataSource = await tx.dataSource.findFirst({ where: { organizationId, ...(source.id ? { id: source.id } : { name: source.name, type: source.type ?? "CSV" }) }, orderBy: { createdAt: "asc" } });
    if (!dataSource && source.id) throw Object.assign(new Error("Sumber data tidak tersedia di organisasi ini."), { statusCode: 403 });
    if (!dataSource) dataSource = await tx.dataSource.create({ data: { organizationId, name: source.name!, type: source.type ?? "CSV", status: "DISCONNECTED" } });
    return writeTransactions(tx, organizationId, dataSource.id, rows);
  }, { timeout: 60000, maxWait: 15000 });
}
