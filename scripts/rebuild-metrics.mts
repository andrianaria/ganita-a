import { prisma, rebuildOutletMetrics } from "../packages/database/src/index.js";

if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error("This maintenance command is restricted to the local database.");
try {
  const outlets = await prisma.outlet.findMany();
  let days = 0;
  for (const outlet of outlets) {
    days += await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${outlet.organizationId}))`;
      return rebuildOutletMetrics(tx, outlet.organizationId, outlet.id);
    }, { timeout: 60000 });
  }
  console.log(JSON.stringify({ outletsRebuilt: outlets.length, dailyMetrics: days }));
} finally { await prisma.$disconnect(); }
