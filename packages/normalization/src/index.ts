import type { ExternalTransaction } from "@ganita-ai/connectors-core";

export interface CanonicalTransactionInput {
  organizationId: string;
  outletId: string;
  dataSourceId: string;
  externalId: string;
  transactionNumber?: string;
  occurredAt: Date;
  grossSales: number;
  discountAmount: number;
  serviceCharge: number;
  taxAmount: number;
  netSales: number;
  totalCost?: number;
  paymentMethod?: string;
  status: string;
  items: CanonicalTransactionItemInput[];
}

export interface CanonicalTransactionItemInput {
  organizationId: string;
  outletId: string;
  externalId?: string;
  productExternalId?: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  unitCost?: number;
  totalCost?: number;
}

export function normalizeTransaction(params: {
  organizationId: string;
  outletId: string;
  dataSourceId: string;
  transaction: ExternalTransaction;
}): CanonicalTransactionInput {
  const { organizationId, outletId, dataSourceId, transaction } = params;
  return {
    organizationId,
    outletId,
    dataSourceId,
    externalId: transaction.externalId,
    transactionNumber: transaction.transactionNumber,
    occurredAt: transaction.occurredAt,
    grossSales: transaction.grossSales,
    discountAmount: transaction.discountAmount,
    serviceCharge: transaction.serviceCharge,
    taxAmount: transaction.taxAmount,
    netSales: transaction.netSales,
    totalCost: transaction.totalCost,
    paymentMethod: transaction.paymentMethod,
    status: transaction.status,
    items: transaction.items.map((item) => ({
      organizationId,
      outletId,
      externalId: item.externalId,
      productExternalId: item.productExternalId,
      productNameSnapshot: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      grossAmount: item.grossAmount,
      discountAmount: item.discountAmount,
      netAmount: item.netAmount,
      unitCost: item.unitCost,
      totalCost: item.totalCost
    }))
  };
}
