import type { Prisma } from "@ganita-ai/database";
import { z } from "zod";
import { requireAuth } from "./auth.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const openingHoursSchema = z.array(z.object({
  day: z.number().int().min(0).max(6),
  mode: z.enum(["open", "closed", "24h"]),
  open: time.optional(),
  close: time.optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "open" && (!value.open || !value.close || value.open === value.close)) {
    ctx.addIssue({ code: "custom", message: "Isi jam buka dan tutup yang berbeda; pilih 24 jam untuk buka sepanjang hari." });
  }
})).refine(days => days.length === 0 || (days.length === 7 && new Set(days.map(d => d.day)).size === 7), "Jadwal harus mencakup tujuh hari tanpa duplikasi.");

export async function requireOutletAdmin(request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.userContext!.apiKeyScopes || !["OWNER", "ADMIN"].includes(request.userContext!.role)) {
    return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Pengelolaan outlet memerlukan akun pemilik atau admin." } });
  }
}

// Preserve operational records, including tables whose outlet IDs are not foreign keys.
export async function assertEmptyOutlet(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  const outlet = await tx.outlet.findFirstOrThrow({ where: { id, organizationId }, include: { _count: { select: {
    transactions: true, transactionItems: true, expenses: true, stockLocations: true, stockMovements: true,
    purchaseOrders: true, metrics: true, healthSnapshots: true, healthIssues: true, insights: true,
  } } } });
  const extra = await tx.inspection.count({ where: { organizationId, outletId: id } })
    + await tx.treatment.count({ where: { organizationId, outletId: id } })
    + await tx.assistantGeneration.count({ where: { organizationId, outletId: id } });
  if (extra || Object.values(outlet._count).some(count => count > 0)) {
    throw Object.assign(new Error("Outlet memiliki riwayat operasional. Tidak dapat dihapus atau dipetakan ulang; nonaktifkan outlet untuk mempertahankan riwayatnya."), { statusCode: 409, code: "OUTLET_HAS_HISTORY" });
  }
  return outlet;
}
