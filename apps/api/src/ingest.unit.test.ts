import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@ganita-ai/database";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), rebuild: vi.fn() }));
vi.mock("@ganita-ai/database", () => ({ prisma: { $transaction: mocks.transaction }, rebuildOutletMetrics: mocks.rebuild }));
import { ingestTransactions, writeTransactions, type ImportTransaction } from "./ingest";

const row = (overrides: Partial<ImportTransaction> = {}): ImportTransaction => ({ externalId: "tx-1", outletCode: "A", occurredAt: new Date("2026-09-17"), grossSales: 100, netSales: 90, discountAmount: 10, taxAmount: 9, serviceCharge: 5, status: "paid", items: [{ productName: "Roll", quantity: 2, unitPrice: 50, grossAmount: 100, discountAmount: 10, netAmount: 90 }], ...overrides });
function transactionClient() {
  return { $executeRaw: vi.fn(), syncJob: { create: vi.fn() }, outletDataSource: { findFirst: vi.fn().mockResolvedValue({ outlet: { id: "a", organizationId: "org" } }) }, outlet: { findFirst: vi.fn().mockResolvedValue({ id: "a", organizationId: "org" }) },
    transaction: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: "saved" }) }, transactionItem: { deleteMany: vi.fn(), create: vi.fn() }, product: { upsert: vi.fn().mockResolvedValue({ id: "product", organizationId: "org" }) },
    dataSource: { findFirst: vi.fn().mockResolvedValue({ id: "source" }), create: vi.fn().mockResolvedValue({ id: "source" }), update: vi.fn() } };
}
let tx: ReturnType<typeof transactionClient>;
const client = () => tx as unknown as Prisma.TransactionClient;
beforeEach(() => { vi.resetAllMocks(); tx = transactionClient(); mocks.transaction.mockImplementation(callback => callback(client())); });
describe("transaction writing orchestration", () => {
  it("upserts using source + outlet + external ID and replaces items", async () => {
    expect(await writeTransactions(client(), "org", "source", [row()])).toMatchObject({ created: 1, updated: 0, imported: 1, sourceId: "source" });
    expect(tx.transaction.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dataSourceId_outletId_externalId: { dataSourceId: "source", outletId: "a", externalId: "tx-1" } }, update: expect.objectContaining({ status: "PAID", totalCost: null }) }));
    expect(tx.transactionItem.deleteMany).toHaveBeenCalledWith({ where: { transactionId: "saved", organizationId: "org" } });
    expect(tx.transactionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org", outletId: "a", unitPrice: 50 }) });
    expect(mocks.rebuild).toHaveBeenCalledWith(tx, "org", "a");
    expect(tx.dataSource.update).toHaveBeenCalledWith({ where: { id: "source", organizationId: "org" }, data: { lastSyncAt: expect.any(Date), status: "CONNECTED" } });
  });
  it("counts replays as updates and retains actual zero costs", async () => {
    tx.transaction.findUnique.mockResolvedValue({ id: "saved" });
    const result = await writeTransactions(client(), "org", "source", [row({ totalCost: 0 })]);
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(tx.transaction.upsert.mock.calls[0][0].update.totalCost).toBe(0);
  });
  it("uses canonical outlet mappings when supplied", async () => {
    await writeTransactions(client(), "org", "source", [row({ outletExternalId: "external-a" })]);
    expect(tx.outletDataSource.findFirst).toHaveBeenCalledWith({ where: { organizationId: "org", dataSourceId: "source", externalOutletId: "external-a" }, include: { outlet: true } });
    expect(tx.outlet.findFirst).not.toHaveBeenCalled();
  });
  it.each([null, { id: "a", organizationId: "foreign" }])("rejects unmapped/foreign outlets %j", async outlet => {
    tx.outlet.findFirst.mockResolvedValue(outlet);
    await expect(writeTransactions(client(), "org", "source", [row()])).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.transaction.upsert).not.toHaveBeenCalled();
  });
  it("rejects unknown canonical mappings", async () => {
    tx.outletDataSource.findFirst.mockResolvedValue(null);
    await expect(writeTransactions(client(), "org", "source", [row({ outletExternalId: "missing" })])).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ netSales: 95 }, { grossSales: 110 }, { discountAmount: 12 }])("rejects mismatched line totals %j", async override => {
    await expect(writeTransactions(client(), "org", "source", [row(override)])).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.transaction.upsert).not.toHaveBeenCalled();
  });
  it("rejects duplicate identities within a batch", async () => {
    await expect(writeTransactions(client(), "org", "source", [row(), row()])).rejects.toThrow("berulang");
    expect(mocks.rebuild).not.toHaveBeenCalled();
  });
  it("permits the same external transaction ID at different outlets", async () => {
    tx.outlet.findFirst.mockResolvedValueOnce({ id: "a", organizationId: "org" }).mockResolvedValueOnce({ id: "b", organizationId: "org" });
    expect((await writeTransactions(client(), "org", "source", [row(), row({ outletCode: "B" })])).created).toBe(2);
    expect(mocks.rebuild).toHaveBeenCalledTimes(2);
  });
  it("rebuilds each touched outlet once per batch", async () => {
    await writeTransactions(client(), "org", "source", [row(), row({ externalId: "tx-2" })]); expect(mocks.rebuild).toHaveBeenCalledTimes(1);
  });
  it("resolves product identity and rejects foreign products", async () => {
    const record = row(); record.items[0].productExternalId = "menu-1";
    await writeTransactions(client(), "org", "source", [record]);
    expect(tx.product.upsert.mock.calls[0][0].where).toEqual({ dataSourceId_externalId: { dataSourceId: "source", externalId: "menu-1" } });
    expect(tx.transactionItem.create.mock.calls[0][0].data.productId).toBe("product");
    tx.product.upsert.mockResolvedValue({ id: "foreign", organizationId: "other" });
    await expect(writeTransactions(client(), "org", "source", [record])).rejects.toMatchObject({ statusCode: 403 });
  });
  it("propagates metric failures for the caller to roll back", async () => {
    mocks.rebuild.mockRejectedValue(Error("rebuild failed"));
    await expect(writeTransactions(client(), "org", "source", [row()])).rejects.toThrow("rebuild failed");
    expect(tx.dataSource.update).not.toHaveBeenCalled();
  });
});
describe("atomic import entry point", () => {
  it("uses a scoped transaction and locks before source lookup", async () => {
    await ingestTransactions("org", { id: "source" }, [row()]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60000, maxWait: 15000 });
    expect(tx.$executeRaw.mock.calls[0][1]).toBe("org");
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.dataSource.findFirst.mock.invocationCallOrder[0]);
    expect(tx.dataSource.findFirst).toHaveBeenCalledWith({ where: { organizationId: "org", id: "source" }, orderBy: { createdAt: "asc" } });
  });
  it("rejects unavailable explicit sources instead of creating replacements", async () => {
    tx.dataSource.findFirst.mockResolvedValue(null);
    await expect(ingestTransactions("org", { id: "foreign" }, [row()])).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.dataSource.create).not.toHaveBeenCalled();
  });
  it.each([undefined, "OTHER"] as const)("creates an explicit stable named source with type %s", async type => {
    tx.dataSource.findFirst.mockResolvedValue(null);
    await ingestTransactions("org", { name: "Stable POS", type }, [row()]);
    expect(tx.dataSource.create).toHaveBeenCalledWith({ data: { organizationId: "org", name: "Stable POS", type: type ?? "CSV", status: "DISCONNECTED" } });
  });
});
