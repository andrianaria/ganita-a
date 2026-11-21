import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ganita-ai/database";
import { hashPassword, requireAuth } from "../auth.js";

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(["master:write", "sales:write", "inventory:write"])).min(1).default(["master:write", "sales:write", "inventory:write"]),
});

async function requireUserAuth(request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.userContext?.userId.startsWith("api-key:")) {
    return reply.code(403).send({ error: { code: "FORBIDDEN", message: "User authentication required" } });
  }
}

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get("/v1/api-keys", { preHandler: requireUserAuth }, async (request) => {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: request.userContext!.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, keyPrefix: true, scopes: true, dataSourceId: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
    return { data: keys };
  });

  app.post("/v1/api-keys", { preHandler: requireUserAuth }, async (request, reply) => {
    if (!["OWNER", "ADMIN"].includes(request.userContext!.role)) {
      return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Only owners and admins can manage API keys" } });
    }
    const body = createApiKeySchema.parse(request.body);
    const secret = `ganita_live_${randomBytes(32).toString("base64url")}`;
    const key = await prisma.$transaction(async tx => {
      const organizationId = request.userContext!.organizationId;
      const source = await tx.dataSource.create({ data: { organizationId, name: body.name, type: "OTHER" } });
      return tx.apiKey.create({
        data: { organizationId, dataSourceId: source.id, name: body.name, keyPrefix: secret.slice(0, 22), keyHash: hashPassword(secret), scopes: body.scopes },
        select: { id: true, name: true, keyPrefix: true, scopes: true, dataSourceId: true, createdAt: true },
      });
    });
    return reply.code(201).send({ data: { ...key, secret, warning: "Simpan secret ini sekarang. Secret lengkap tidak dapat dilihat lagi." } });
  });

  app.post("/v1/api-keys/:id/revoke", { preHandler: requireUserAuth }, async (request, reply) => {
    if (!["OWNER", "ADMIN"].includes(request.userContext!.role)) {
      return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Only owners and admins can manage API keys" } });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await prisma.apiKey.updateMany({
      where: { id: params.id, organizationId: request.userContext!.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "API key tidak ditemukan atau sudah dicabut" } });
    return { data: { id: params.id, status: "REVOKED" } };
  });
}
