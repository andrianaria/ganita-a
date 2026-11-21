import { describe, expect, it } from "vitest";
import { openingHoursSchema } from "./outlet-management.js";
const week = () => Array.from({ length: 7 }, (_, day) => ({ day, mode: "open", open: "09:00", close: "21:00" }));
describe("weekly opening hours", () => {
  it("accepts unset, daytime, overnight, closed, and 24-hour schedules", () => {
    expect(openingHoursSchema.safeParse([]).success).toBe(true);
    const rows = week(); rows[0].close = "02:00"; rows[1].mode = "closed"; rows[2].mode = "24h";
    expect(openingHoursSchema.safeParse(rows).success).toBe(true);
  });
  it.each(["25:00", "12:60", "9:00", "", "12pm"])("rejects malformed time %s", open => {
    const rows = week(); rows[0].open = open;
    expect(openingHoursSchema.safeParse(rows).success).toBe(false);
  });
  it("rejects duplicate days, partial weeks, equal times and missing times", () => {
    const rows = week(); rows[6].day = 0;
    expect(openingHoursSchema.safeParse(rows).success).toBe(false);
    expect(openingHoursSchema.safeParse(week().slice(1)).success).toBe(false);
    expect(openingHoursSchema.safeParse(week().map(r => ({ ...r, close: "09:00" }))).success).toBe(false);
    expect(openingHoursSchema.safeParse(week().map(({ open, ...r }) => r)).success).toBe(false);
  });
});
