import { csvImportPayload, type CsvRow } from "./csv-import";

export const salesCsvTemplate = "transaction_id,outlet_code,date,product,quantity,gross_sales,discount,net_sales,cost,product_id,unit_price\r\n";
export type ImportOutlet = { id: string; name: string; code: string };

export function inspectSalesImport(rows: CsvRow[], outlets: ImportOutlet[]) {
  const known = new Map(outlets.map(outlet => [outlet.code, outlet]));
  const payload = csvImportPayload(rows, "CSV POS");
  const groups = new Map<string, { code: string; name: string | null; transactions: number; netSales: number }>();
  for (const row of payload.rows) {
    const group = groups.get(row.outletCode) ?? { code: row.outletCode, name: known.get(row.outletCode)?.name ?? null, transactions: 0, netSales: 0 };
    group.transactions += 1;
    group.netSales += row.netSales;
    groups.set(row.outletCode, group);
  }
  return { transactionCount: payload.rows.length, outlets: [...groups.values()].sort((a, b) => a.code.localeCompare(b.code)), unknownCodes: [...groups.values()].filter(group => group.name === null).map(group => group.code) };
}

export function exportOutletCodes(outlets: ImportOutlet[]) {
  // Prefix spreadsheet formula markers before CSV quoting untrusted outlet labels.
  const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return "outlet_code,outlet_name\r\n" + outlets.map(outlet => `${cell(outlet.code)},${cell(outlet.name)}`).join("\r\n");
}
