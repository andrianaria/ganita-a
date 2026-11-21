import { describe, expect, it } from "vitest";
import { parseSalesCsv, csvImportPayload } from "./csv-import";
const header = "transaction_id,outlet_code,date,product,quantity,gross_sales,discount,net_sales,cost,unit_price\n";
const line = '123,A,2026-09-17T10:00:00+07:00,"Sushi, Salmon",2,100,10,90,40,50';
describe("CSV ingestion", () => {
  it("parses quoted names, BOM, CRLF and keeps explicit unit prices", () => {
    const rows = parseSalesCsv("\uFEFF" + header.replace("\n", "\r\n") + line);
    expect(rows[0].productName).toBe("Sushi, Salmon");
    expect(rows[0].unitPrice).toBe(50);
    expect(rows[0].totalCost).toBe(40);
  });
  it("groups by outlet AND transaction id, with stable source identity", () => {
    const rows = parseSalesCsv(header + line + "\n" + line.replace(",A,", ",B,"));
    const payload = csvImportPayload(rows, "Primary POS");
    expect(payload.rows).toHaveLength(2);
    expect(payload.sourceName).toBe("Primary POS");
    expect(payload.rows.map(r => r.outletCode)).toEqual(["A", "B"]);
  });
  it("rejects invalid rows instead of silently dropping them", () => {
    expect(() => parseSalesCsv(header + line.replace(",2,100", ",0,100"))).toThrow("Baris 2");
    expect(() => parseSalesCsv(header + line.replace("+07:00", ""))).toThrow("zona waktu");
    expect(() => parseSalesCsv(header + line.replace(",90,40", ",900,40"))).toThrow("Baris 2");
  });
  it("distinguishes missing cost from a genuine zero cost", () => {
    expect(parseSalesCsv(header + line.replace(",40,50", ",,50"))[0].totalCost).toBeUndefined();
    expect(parseSalesCsv(header + line.replace(",40,50", ",0,50"))[0].totalCost).toBe(0);
  });
  it("parses quoted newlines and escaped quotes", () => {
    const name = '"Salmon,\n\"\"Premium\"\""';
    expect(parseSalesCsv(header + line.replace('"Sushi, Salmon"', name))[0].productName).toBe('Salmon,\n"Premium"');
  });
  it("normalizes header case and surrounding spaces", () => expect(parseSalesCsv(header.toUpperCase() + line)).toHaveLength(1));
  it("calculates unit price only when not explicitly supplied", () => expect(parseSalesCsv(header + line.replace(/,50$/, ","))[0].unitPrice).toBe(50));
  it.each(["", "   ", "-1", "NaN", "Infinity", "Rp100"])("rejects invalid quantity %j", value => expect(() => parseSalesCsv(header + line.replace(",2,100", `,${value},100`))).toThrow());
  it("rejects missing and duplicate column names", () => {
    expect(() => parseSalesCsv(header.replace("outlet_code", "branch") + line)).toThrow("outlet_code");
    expect(() => parseSalesCsv(header.trim() + ",PRODUCT\n" + line + ",extra")).toThrow("berulang");
  });
  it("rejects empty files and uploads over the record limit", () => {
    expect(() => parseSalesCsv(header)).toThrow("1 sampai");
    expect(() => parseSalesCsv(header + Array(20001).fill(line).join("\n"))).toThrow("20.000");
  });
  it("rejects missing identity or invalid dates", () => {
    expect(() => parseSalesCsv(header + line.replace("123,A", ",A"))).toThrow("transaction_id");
    expect(() => parseSalesCsv(header + line.replace("2026-09-17T10:00:00+07:00", "invalidZ"))).toThrow("date");
  });
  it("rejects unit-price disagreement and invalid required amounts", () => {
    expect(() => parseSalesCsv(header + line.replace(/,50$/, ",25"))).toThrow("unit_price");
    expect(() => parseSalesCsv(header + line.replace(",100,10", ",,10"))).toThrow("gross_sales");
    expect(() => parseSalesCsv(header + line.replace(",40,50", ",-1,50"))).toThrow("cost");
  });
  it("combines line totals for the same transaction without mutating rows", () => {
    const rows = parseSalesCsv(header + line + "\n" + line);
    const copy = structuredClone(rows);
    const payload = csvImportPayload(rows, "  Stable POS  ");
    expect(payload.sourceName).toBe("Stable POS");
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]).toMatchObject({ grossSales: 200, discountAmount: 20, netSales: 180, totalCost: 80 });
    expect(payload.rows[0].items).toHaveLength(2); expect(rows).toEqual(copy);
  });
  it("does not infer a total cost when one line is missing its cost", () => {
    const rows = parseSalesCsv(header + line + "\n" + line.replace(",40,50", ",,50"));
    expect(csvImportPayload(rows, "POS").rows[0].totalCost).toBeUndefined();
  });
  it("rejects blank sources and conflicting transaction timestamps", () => {
    const rows = parseSalesCsv(header + line + "\n" + line.replace("T10:", "T11:"));
    expect(() => csvImportPayload(rows, " ")).toThrow("wajib");
    expect(() => csvImportPayload(rows, "POS")).toThrow("tidak konsisten");
  });
});
