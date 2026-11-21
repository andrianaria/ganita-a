import { z } from "zod";
export const timezoneSchema = z.string().refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Zona waktu IANA tidak valid.");

export const businessTypeSchema = z.enum(["Restoran", "Kafe", "Toko roti", "Pujasera", "Jaringan multi-brand"]);
const numericSetting = (min: number, max: number) => z.union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number().finite().min(min).max(max)).transform(String);
export const targetsSchema = z.object({
  foodCost: numericSetting(1, 100), margin: numericSetting(0, 100),
  waste: numericSetting(0, 100), stockDays: numericSetting(1, 365),
});
