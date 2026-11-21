import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { ExternalTransaction, POSConnector } from "@ganita-ai/connectors-core";

export interface CsvColumnMapping {
  date: string;
  outlet: string;
  transactionId: string;
  product: string;
  quantity: string;
  grossSales: string;
  discount: string;
  netSales: string;
  cost: string;
}

export interface CsvPreviewResult {
  validRows: number;
  invalidRows: Array<{ rowNumber: number; errors: string[] }>;
  sample: ExternalTransaction[];
}

const rowSchema = z.object({
  date: z.coerce.date(),
  outlet: z.string().min(1),
  transactionId: z.string().min(1),
  product: z.string().min(1),
  quantity: z.coerce.number().positive(),
  grossSales: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0),
  netSales: z.coerce.number().nonnegative(),
  cost: z.coerce.number().nonnegative().optional()
});

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (value == null || !String(value).trim()) return NaN;
  return Number(String(value).replace(/,/g, ""));
}

export function previewCsvTransactions(csv: string, mapping: CsvColumnMapping, sampleSize = 10): CsvPreviewResult {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const sample: ExternalTransaction[] = [];
  const invalidRows: CsvPreviewResult["invalidRows"] = [];
  let validRows = 0;

  for (const [index, row] of rows.entries()) {
    const parsed = rowSchema.safeParse({
      date: row[mapping.date],
      outlet: row[mapping.outlet],
      transactionId: row[mapping.transactionId],
      product: row[mapping.product],
      quantity: toNumber(row[mapping.quantity]),
      grossSales: toNumber(row[mapping.grossSales]),
      discount: row[mapping.discount]?.trim() ? toNumber(row[mapping.discount]) : 0,
      netSales: toNumber(row[mapping.netSales]),
      cost: row[mapping.cost]?.trim() ? toNumber(row[mapping.cost]) : undefined
    });

    if (!parsed.success) {
      invalidRows.push({
        rowNumber: index + 2,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      });
      continue;
    }

    validRows += 1;
    if (sample.length < sampleSize) {
      const itemCost = parsed.data.cost;
      sample.push({
        externalId: parsed.data.transactionId,
        outletExternalId: parsed.data.outlet,
        occurredAt: parsed.data.date,
        grossSales: parsed.data.grossSales,
        discountAmount: parsed.data.discount,
        serviceCharge: 0,
        taxAmount: 0,
        netSales: parsed.data.netSales,
        totalCost: itemCost,
        status: "PAID",
        items: [
          {
            productName: parsed.data.product,
            quantity: parsed.data.quantity,
            unitPrice: parsed.data.grossSales / parsed.data.quantity,
            grossAmount: parsed.data.grossSales,
            discountAmount: parsed.data.discount,
            netAmount: parsed.data.netSales,
            totalCost: itemCost
          }
        ]
      });
    }
  }

  return { validRows, invalidRows, sample };
}

export class CsvConnector implements POSConnector {
  constructor(private readonly transactions: ExternalTransaction[]) {}

  async testConnection() {
    return true;
  }

  async getOutlets() {
    const byId = new Map<string, string>();
    for (const transaction of this.transactions) byId.set(transaction.outletExternalId, transaction.outletExternalId);
    return [...byId.entries()].map(([externalId, name]) => ({ externalId, name }));
  }

  async getTransactions(params: { outletId: string; from: Date; to: Date }) {
    return {
      data: this.transactions.filter(
        (transaction) =>
          transaction.outletExternalId === params.outletId &&
          transaction.occurredAt >= params.from &&
          transaction.occurredAt <= params.to
      )
    };
  }

  async getProducts() {
    const byName = new Map<string, string>();
    for (const transaction of this.transactions) {
      for (const item of transaction.items) byName.set(item.productName, item.productName);
    }
    return [...byName.values()].map((name) => ({ externalId: name, name }));
  }
}
