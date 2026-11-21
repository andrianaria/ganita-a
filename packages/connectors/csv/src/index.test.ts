import { describe, expect, it } from "vitest";
import { CsvConnector, previewCsvTransactions } from "./index";
const mapping = { date: "date", outlet: "outlet", transactionId: "id", product: "product", quantity: "qty", grossSales: "gross", discount: "discount", netSales: "net", cost: "cost" };
const header = "date,outlet,id,product,qty,gross,discount,net,cost\n";
const line = '2026-09-17T00:00:00Z,A,1,"Roll, Salmon",2,"1,000",100,900,400';
describe("CSV connector preview", () => {
  it("maps quoted numeric and text fields to canonical line totals", () => {
    const result = previewCsvTransactions(header + line, mapping);
    expect(result).toMatchObject({ validRows: 1, invalidRows: [] });
    expect(result.sample[0]).toMatchObject({ externalId: "1", outletExternalId: "A", netSales: 900, totalCost: 400, items: [expect.objectContaining({ productName: "Roll, Salmon", unitPrice: 500 })] });
  });
  it("reports invalid record numbers without counting them as valid", () => {
    const result = previewCsvTransactions(header + line + "\n" + line.replace(",2,", ",0,"), mapping);
    expect(result.validRows).toBe(1); expect(result.invalidRows[0].rowNumber).toBe(3); expect(result.invalidRows[0].errors[0]).toContain("quantity");
  });
  it("limits previews while counting all valid records", () => {
    const result = previewCsvTransactions(header + [line, line, line].join("\n"), mapping, 1);
    expect(result.validRows).toBe(3); expect(result.sample).toHaveLength(1);
  });
  it("supports BOM exports", () => expect(previewCsvTransactions("\uFEFF" + header + line, mapping).validRows).toBe(1));
  it("keeps absent cost unknown and explicit zero cost zero", () => {
    expect(previewCsvTransactions(header + line.replace(/,400$/, ","), mapping).sample[0].totalCost).toBeUndefined();
    expect(previewCsvTransactions(header + line.replace(/,400$/, ",0"), mapping).sample[0].totalCost).toBe(0);
  });
  it("rejects blank required amounts instead of inventing zero sales", () => expect(previewCsvTransactions(header + line.replace(",900,", ",,"), mapping).invalidRows).toHaveLength(1));
  it("defaults an omitted discount to zero", () => expect(previewCsvTransactions(header + line.replace(",100,900", ",,1000"), mapping).sample[0].discountAmount).toBe(0));
});
describe("in-memory CSV connector", () => {
  const source = () => previewCsvTransactions(header + [line, line.replace(",A,1,", ",B,2,"), line.replace("2026-09-17", "2026-09-18")].join("\n"), mapping).sample;
  it("lists unique outlets and products", async () => {
    const connector = new CsvConnector(source());
    expect(await connector.testConnection()).toBe(true);
    expect(await connector.getOutlets()).toEqual([{ externalId: "A", name: "A" }, { externalId: "B", name: "B" }]);
    expect(await connector.getProducts()).toEqual([{ externalId: "Roll, Salmon", name: "Roll, Salmon" }]);
  });
  it("filters by outlet and inclusive time range", async () => {
    const connector = new CsvConnector(source());
    expect((await connector.getTransactions({ outletId: "A", from: new Date("2026-09-17"), to: new Date("2026-09-17") })).data).toHaveLength(1);
    expect((await connector.getTransactions({ outletId: "A", from: new Date("2026-09-18"), to: new Date("2026-09-18") })).data).toHaveLength(1);
    expect((await connector.getTransactions({ outletId: "unknown", from: new Date("2026-09-17"), to: new Date("2026-09-18") })).data).toEqual([]);
  });
});
