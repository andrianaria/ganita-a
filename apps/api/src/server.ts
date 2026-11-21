import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadConfig, type AppConfig } from "@ganita-ai/config";
import { authRoutes } from "./routes/auth.js";
import { organizationRoutes } from "./routes/organization.js";
import { dataSourceRoutes } from "./routes/data-sources.js";
import { healthRoutes } from "./routes/health.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { importRoutes } from "./routes/imports.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { integrationRoutes } from "./routes/integrations.js";
import { teamRoutes } from "./routes/team.js";
import { operationsRoutes } from "./routes/operations.js";
import { assistantRoutes } from "./routes/assistant.js";
import { prisma } from "@ganita-ai/database";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildServer() {
  const config = loadConfig();
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  app.decorate("config", config);

  await app.register(cors, { origin: [config.APP_BASE_URL], credentials: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.get("/health", async () => ({ ok: true, service: "ganita-ai-api" }));
  app.get("/ready", async (_request, reply) => {
    try { await prisma.$queryRaw`SELECT 1`; return { ok: true }; }
    catch { return reply.code(503).send({ ok: false }); }
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (typeof error === "object" && error !== null && "issues" in error) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error } });
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") return reply.code(409).send({ error: { code: "CONFLICT", message: "Data dengan kode atau email tersebut sudah ada." } });
      if (error.code === "P2025") return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Data tidak ditemukan." } });
      if (error.code === "P2003") return reply.code(409).send({ error: { code: "IN_USE", message: "Data masih digunakan oleh catatan lain." } });
    }
    if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: "REQUEST_REJECTED", message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
  });

  await app.register(authRoutes);
  await app.register(onboardingRoutes);
  await app.register(importRoutes);
  await app.register(apiKeyRoutes);
  await app.register(integrationRoutes);
  await app.register(organizationRoutes);
  await app.register(dataSourceRoutes);
  await app.register(inventoryRoutes);
  await app.register(healthRoutes);
  await app.register(teamRoutes);
  await app.register(operationsRoutes);
  await app.register(assistantRoutes);

  return app;
}
