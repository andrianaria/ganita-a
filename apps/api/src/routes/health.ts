import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ganita-ai/database";
import { requireAuth } from "../auth.js";
import { dashboardData } from "../dashboard.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard", { preHandler: requireAuth }, async (request) => {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
    const query = z.object({ outletId: z.string().uuid().optional(), from: date.optional(), to: date.optional() }).parse(request.query);
    return { data: await dashboardData(request.userContext!.organizationId, query) };
  });

  app.get("/v1/outlets/:id/health", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const snapshot = await prisma.outletHealthSnapshot.findFirst({
      where: { outletId: params.id, organizationId: request.userContext!.organizationId },
      include: { issues: { where: { status: "OPEN" }, include: { insights: true } } },
      orderBy: { snapshotDate: "desc" }
    });
    return { data: snapshot };
  });

  app.get("/v1/outlets/:id/metrics", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const metrics = await prisma.dailyOutletMetric.findMany({
      where: { outletId: params.id, organizationId: request.userContext!.organizationId },
      orderBy: { metricDate: "desc" },
      take: 90
    });
    return { data: metrics };
  });

  app.get("/v1/outlets/:id/issues", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const issues = await prisma.healthIssue.findMany({
      where: { outletId: params.id, organizationId: request.userContext!.organizationId },
      include: { insights: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { detectedAt: "desc" }
    });
    return { data: issues };
  });

  app.get("/v1/issues/:id", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const issue = await prisma.healthIssue.findFirstOrThrow({
      where: { id: params.id, organizationId: request.userContext!.organizationId },
      include: { outlet: true, insights: true }
    });
    return { data: issue };
  });

  app.post("/v1/issues/:id/acknowledge", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const issue = await prisma.healthIssue.updateMany({
      where: { id: params.id, organizationId: request.userContext!.organizationId },
      data: { status: "ACKNOWLEDGED" }
    });
    return { data: issue };
  });

  app.post("/v1/issues/:id/resolve", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const issue = await prisma.healthIssue.updateMany({
      where: { id: params.id, organizationId: request.userContext!.organizationId },
      data: { status: "RESOLVED", resolvedAt: new Date() }
    });
    return { data: issue };
  });
}
