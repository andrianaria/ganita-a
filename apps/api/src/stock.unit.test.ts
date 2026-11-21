import { describe, expect, it } from "vitest";
import { convertQuantity, signedQuantity, movementInput } from "./stock";
describe("inventory arithmetic", () => {
  it.each([[100, "g", "kg", .1], [2, "kg", "g", 2000], [500, "ml", "l", .5], [3, "piece", "pcs", 3], [2, "box", "box", 2]])("converts %s %s to %s", (quantity, from, to, expected) => expect(convertQuantity(Number(quantity), String(from), String(to))).toBe(expected));
  it.each([["g", "ml"], ["box", "pcs"], ["kg", "pcs"]])("rejects incompatible units %s %s", (a, b) => expect(() => convertQuantity(1, a, b)).toThrow());
  it.each(["SALE_USAGE", "WASTE", "TRANSFER_OUT"])("normalizes %s as an outflow", type => { expect(signedQuantity(type, 2)).toBe(-2); expect(signedQuantity(type, -2)).toBe(-2); });
  it.each(["PURCHASE", "TRANSFER_IN", "PRODUCTION", "RETURN"])("rejects negative %s", type => expect(() => signedQuantity(type, -1)).toThrow());
  it("retains signed adjustments", () => { expect(signedQuantity("ADJUSTMENT", -2)).toBe(-2); expect(signedQuantity("ADJUSTMENT", 2)).toBe(2); });
  it("rejects unpaired external identity and zero quantities", () => {
    const value = { stockLocationId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", ingredientId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", type: "PURCHASE", occurredAt: new Date(), quantity: 1, unit: "kg", reason: "test" };
    expect(movementInput.safeParse(value).success).toBe(true);
    expect(movementInput.safeParse({ ...value, quantity: 0 }).success).toBe(false);
    expect(movementInput.safeParse({ ...value, externalId: "unpaired" }).success).toBe(false);
  });
});
