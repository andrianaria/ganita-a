import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ganita-ai/database";
import { slugify } from "@ganita-ai/shared";
import { getClerkIdentity, encodePassword, verifyPassword, issueToken, requireAuth } from "../auth.js";
import { createClerkClient } from "@clerk/backend";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  organizationName: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/v1/auth/session", async (request, reply) => {
    const identity = await getClerkIdentity(request);
    if (!identity) {
      return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Valid Clerk session required" } });
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId: identity.clerkUserId },
      include: { memberships: true },
    });
    const membership = user?.memberships[0];
    if (!user || !membership) {
      return reply.code(409).send({ error: { code: "ONBOARDING_REQUIRED", message: "Akun Clerk valid, tetapi belum terhubung ke workspace Ganita. Selesaikan onboarding terlebih dahulu." } });
    }

    if (user.status !== "ACTIVE" || user.memberships.length !== 1) return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Workspace tidak tersedia." } });
    return {
      data: {
        token: request.headers.authorization!.slice(7),
      },
    };
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const organizationSlug = slugify(body.organizationName);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: body.email.toLowerCase(), name: body.name, passwordHash: await encodePassword(body.password) }
      });
      const organization = await tx.organization.create({
        data: { name: body.organizationName, slug: organizationSlug }
      });
      await tx.organizationUser.create({
        data: { userId: user.id, organizationId: organization.id, role: "OWNER" }
      });
      return { user, organization };
    });

    const token = issueToken(
      { userId: result.user.id, organizationId: result.organization.id, role: "OWNER", authVersion: result.user.authVersion },
      app.config.JWT_SECRET
    );

    return reply.code(201).send({
      data: {
        token,
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
        organization: result.organization
      }
    });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: { memberships: true } });
    if (!user || user.clerkUserId || user.status !== "ACTIVE" || user.memberships.length !== 1 || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    }
    const membership = user.memberships[0];
    if (!user.passwordHash.startsWith("scrypt:")) await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await encodePassword(body.password) } });
    const token = issueToken(
      { userId: user.id, organizationId: membership.organizationId, role: membership.role, authVersion: user.authVersion },
      app.config.JWT_SECRET
    );
    return { data: { token } };
  });

  app.post("/v1/auth/logout", { preHandler: requireAuth }, async (request) => {
    if (request.userContext!.clerkSessionId) {
      await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }).sessions.revokeSession(request.userContext!.clerkSessionId!);
    } else {
      await prisma.user.update({ where: { id: request.userContext!.userId }, data: { authVersion: { increment: 1 } } });
    }
    return { data: { ok: true } };
  });

  app.get("/v1/auth/me", { preHandler: requireAuth }, async (request) => {
    const context = request.userContext!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.userId } });
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: context.organizationId } });
    return { data: { user: { id: user.id, email: user.email, name: user.name }, organization, role: context.role } };
  });
}
