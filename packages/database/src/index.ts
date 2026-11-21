import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});

export type { PrismaClient };
export * from "@prisma/client";
export { rebuildOutletMetrics, aggregateDaily, businessDate, normalizeStoredTimezone } from "./metrics.js";
