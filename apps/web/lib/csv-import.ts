import { parse } from "csv-parse/browser/esm/sync";

export type CsvRow = {
  externalId: string; outletCode: string; occurredAt: string; productName: string;
  productExternalId: string; quantity: number; unitPrice: number; grossSales: number;
  discountAmount: number; netSales: number; totalCost?: number;
};

export function parseSalesCsv(input: string): CsvRow[] {
  const required = ["transaction_id", "outlet_code", "date", "product", "quantity", "gross_sales", "net_sales"];
  const records = parse(input, {
    bom: true, skip_empty_lines: true, trim: true, record_delimiter: ["\r\n", "\n", "\r"],
    columns: (headers: string[]) => {
      const normalized = headers.map(h => h.toLowerCase().trim());
      const missing = required.filter(h => !normalized.includes(h));
      if (missing.length) throw new Error(`Kolom wajib belum ada: ${missing.join(", ")}`);
      if (new Set(normalized).size !== normalized.length) throw new Error("Nama kolom tidak boleh berulang.");
      return normalized;
    },
  }) as Record<string, string>[];
  if (!records.length || records.length > 20000) throw new Error("CSV harus berisi 1 sampai 20.000 baris.");
  return records.map((r, index) => {
    const fail = (field: string): never => { throw new Error(`Baris ${index + 2}: ${field} tidak valid. Tidak ada data yang diimpor.`); };
    const numeric = (key: string, optional = false) => {
      if (!r[key]?.trim()) return optional ? undefined : fail(key);
      const value = Number(r[key]);
      if (!Number.isFinite(value) || value < 0) return fail(key);
      return value;
    };
    for (const key of ["transaction_id", "outlet_code", "date", "product"]) if (!r[key]?.trim()) fail(key);
    // Require an explicit offset so a business date never depends on the browser timezone.
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(r.date) || !Number.isFinite(Date.parse(r.date))) fail("date (ISO 8601 dengan zona waktu, contoh 2026-09-17T12:00:00+07:00)");
    const quantity = numeric("quantity")!;
    if (quantity <= 0) fail("quantity");
    const grossSales = numeric("gross_sales")!;
    const netSales = numeric("net_sales")!;
    const discountAmount = numeric("discount", true) ?? 0;
    const unitPrice = numeric("unit_price", true) ?? grossSales / quantity;
    if (Math.abs(unitPrice * quantity - grossSales) > 1 || Math.abs(grossSales - discountAmount - netSales) > 1) fail("gross_sales / discount / net_sales / unit_price");
    return { externalId: r.transaction_id, outletCode: r.outlet_code, occurredAt: new Date(r.date).toISOString(), productName: r.product,
      productExternalId: r.product_id || r.product, quantity, unitPrice, grossSales, discountAmount, netSales, totalCost: numeric("cost", true) };
  });
}

export function csvImportPayload(rows: CsvRow[], sourceName: string) {
  if (!sourceName.trim()) throw new Error("Nama sumber CSV wajib diisi.");
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.outletCode, row.externalId]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return { sourceName: sourceName.trim(), sourceType: "CSV", rows: [...groups.values()].map(items => {
    const first = items[0];
    if (items.some(i => i.occurredAt !== first.occurredAt)) throw new Error(`Waktu transaksi ${first.externalId} pada outlet ${first.outletCode} tidak konsisten.`);
    const sum = (field: "grossSales" | "discountAmount" | "netSales") => items.reduce((n, i) => n + i[field], 0);
    return { externalId: first.externalId, outletCode: first.outletCode, occurredAt: first.occurredAt,
      grossSales: sum("grossSales"), discountAmount: sum("discountAmount"), netSales: sum("netSales"), taxAmount: 0, serviceCharge: 0, status: "COMPLETED",
      totalCost: items.every(i => i.totalCost !== undefined) ? items.reduce((n, i) => n + i.totalCost!, 0) : undefined,
      items: items.map(i => ({ productExternalId: i.productExternalId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice,
        grossAmount: i.grossSales, discountAmount: i.discountAmount, netAmount: i.netSales, totalCost: i.totalCost })) };
  }) };
}
