import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "./csv-import";
import { exportOutletCodes, inspectSalesImport, salesCsvTemplate } from "./sales-import";

const line = "SAME,A,2026-09-19T12:00:00+07:00,Sushi,2,100000,0,100000,,P1,50000";
describe("Sales import preview", () => {
  it("offers a header-only template without accidental sample transactions", () => {
    expect(salesCsvTemplate.trim().split("\n")).toHaveLength(1);
    expect(parseSalesCsv(salesCsvTemplate + line)[0]).toMatchObject({ outletCode: "A", totalCost: undefined, quantity: 2 });
  });
  it("counts distinct transactions per outlet and flags unknown codes", () => {
    const rows = parseSalesCsv(salesCsvTemplate + [line, line, line.replace(",A,", ",B,")].join("\n"));
    expect(inspectSalesImport(rows, [{ id: "a", name: "Outlet A", code: "A" }])).toEqual({ transactionCount: 2, unknownCodes: ["B"], outlets: [{ code: "A", name: "Outlet A", transactions: 1, netSales: 200000 }, { code: "B", name: null, transactions: 1, netSales: 100000 }] });
  });
  it("preserves exact outlet codes without assuming a selected outlet", () => {
    const rows = parseSalesCsv(salesCsvTemplate + line.replace(",A,", ",a,"));
    expect(inspectSalesImport(rows, [{ id: "a", name: "A", code: "A" }]).unknownCodes).toEqual(["a"]);
  });
  it("handles 1000 outlets without merging repeated transaction IDs", () => {
    const outlets = Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, name: `Outlet ${i}`, code: `O-${i}` }));
    const rows = parseSalesCsv(salesCsvTemplate + outlets.map(o => line.replace(",A,", `,${o.code},`)).join("\n"));
    const result = inspectSalesImport(rows, outlets);
    expect(result.transactionCount).toBe(1000); expect(result.outlets).toHaveLength(1000); expect(result.unknownCodes).toEqual([]);
  });
  it("escapes outlet export values and guards spreadsheet formulas", () => {
    expect(exportOutletCodes([{ id: "a", code: "=1+1", name: 'Outlet, "A"' }])).toBe('outlet_code,outlet_name\r\n"\'=1+1","Outlet, ""A"""');
  });
});
