import { describe, expect, it } from "vitest";
import { percentage, round, slugify } from "./index";

describe("shared number and identifier helpers", () => {
  it.each([
    ["  Street Sushi! Rancamaya  ", "street-sushi-rancamaya"],
    ["A___B / C", "a-b-c"], ["---", ""], ["", ""], ["Outlet 123", "outlet-123"],
  ])("slugifies %j", (value, expected) => expect(slugify(value)).toBe(expected));
  it.each([[1.005, 2, 1.01], [12.34567, 4, 12.3457], [12.6, 0, 13], [-12.344, 2, -12.34], [0, 2, 0]])(
    "rounds %s to %s decimals", (value, digits, expected) => expect(round(value, digits)).toBe(expected),
  );
  it("rounds to two decimals by default", () => expect(round(42.666)).toBe(42.67));
  it.each([0, Infinity, -Infinity, NaN])("protects a non-usable denominator %s", denominator => expect(percentage(50, denominator)).toBe(0));
  it("retains precision for ratios and negative margins", () => {
    expect(percentage(1, 3)).toBe(33.3333);
    expect(percentage(-20, 100)).toBe(-20);
  });
});
