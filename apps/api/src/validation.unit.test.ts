import { expect, it } from "vitest";
import { timezoneSchema } from "./validation";
it.each(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "America/New_York"])("accepts valid zone %s", value => expect(timezoneSchema.parse(value)).toBe(value));
it.each(["", "local", "Invalid/Zone", "UTC+7", "Asia/Jakarta (GMT+7)", "Asia/Makassar (GMT+8)", "Asia/Jayapura (GMT+9)", null, 7])("rejects invalid zone %j", value => expect(timezoneSchema.safeParse(value).success).toBe(false));
