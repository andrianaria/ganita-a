import { expect, it } from "vitest";
import { normalizeTransaction } from "./index";

it("maps all amounts and stamps trusted tenant IDs on every item", () => {
  const transaction = { externalId: "tx-1", outletExternalId: "partner-outlet", transactionNumber: "001", occurredAt: new Date("2026-09-17T03:00:00Z"), grossSales: 100, discountAmount: 10, serviceCharge: 5, taxAmount: 9, netSales: 90, totalCost: 40, paymentMethod: "QRIS", status: "PAID", items: [{ externalId: "line-1", productExternalId: "p-1", productName: "Roll", quantity: 2, unitPrice: 50, grossAmount: 100, discountAmount: 10, netAmount: 90, unitCost: 20, totalCost: 40 }] };
  const original = structuredClone(transaction);
  const result = normalizeTransaction({ organizationId: "org", outletId: "outlet", dataSourceId: "source", transaction });
  expect(result).toEqual({ organizationId: "org", outletId: "outlet", dataSourceId: "source", externalId: "tx-1", transactionNumber: "001", occurredAt: transaction.occurredAt, grossSales: 100, discountAmount: 10, serviceCharge: 5, taxAmount: 9, netSales: 90, totalCost: 40, paymentMethod: "QRIS", status: "PAID", items: [{ organizationId: "org", outletId: "outlet", externalId: "line-1", productExternalId: "p-1", productNameSnapshot: "Roll", quantity: 2, unitPrice: 50, grossAmount: 100, discountAmount: 10, netAmount: 90, unitCost: 20, totalCost: 40 }] });
  expect(transaction).toEqual(original);
  expect(result.items[0]).not.toBe(transaction.items[0]);
});
