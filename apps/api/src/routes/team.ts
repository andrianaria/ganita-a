import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ganita-ai/database";
import { getClerkIdentity, hashPassword, requireAuth } from "../auth.js";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export async function teamRoutes(app: FastifyInstance) {
  app.get("/v1/team", { preHandler: requireAuth }, async request => {
    const organizationId = request.userContext!.organizationId;
    const members = await prisma.organizationUser.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true } } } });
    const invitations = await prisma.teamInvitation.findMany({ where: { organizationId, acceptedAt: null, revokedAt: null }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: "desc" } });
    return { data: { members, invitations, role: request.userContext!.role } };
  });
  app.post("/v1/team/invitations", { preHandler: requireAuth }, async (request, reply) => {
    const body = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) }).parse(request.body);
    if (body.role === "ADMIN" && request.userContext!.role !== "OWNER") throw fail("Hanya pemilik dapat mengundang admin.", 403);
    const token = randomBytes(32).toString("base64url");
    const invitation = await prisma.$transaction(async tx => {
      await tx.teamInvitation.updateMany({ where: { organizationId: request.userContext!.organizationId, email: body.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.teamInvitation.create({ data: { ...body, organizationId: request.userContext!.organizationId, tokenHash: hashPassword(token), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    });
    return reply.code(201).send({ data: { id: invitation.id, expiresAt: invitation.expiresAt, url: `${app.config.APP_BASE_URL}/invite#${token}`, delivery: "LINK" } });
  });
  app.delete("/v1/team/invitations/:id", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.teamInvitation.update({ where: { id, organizationId: request.userContext!.organizationId }, data: { revokedAt: new Date() } });
    return { data: { revoked: true } };
  });
  app.post("/v1/team/accept", async request => {
    const identity = await getClerkIdentity(request);
    if (!identity?.email) throw fail("Masuk dengan akun Clerk dan email terverifikasi untuk menerima undangan.", 401);
    const { token } = z.object({ token: z.string().min(40).max(100) }).parse(request.body);
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.clerkUserId}))`;
      const invitation = await tx.teamInvitation.findUnique({ where: { tokenHash: hashPassword(token) } });
      if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date() || invitation.email !== identity.email!.toLowerCase()) throw fail("Undangan tidak berlaku atau email akun berbeda.", 403);
      let user = await tx.user.findUnique({ where: { clerkUserId: identity.clerkUserId }, include: { memberships: true } });
      if (user && (user.status !== "ACTIVE" || user.memberships.some(m => m.organizationId !== invitation.organizationId))) throw fail("Akun sudah berada di organisasi lain atau tidak aktif.", 409);
      if (!user) user = await tx.user.create({ data: { clerkUserId: identity.clerkUserId, email: identity.email!.toLowerCase(), name: identity.name ?? identity.email!, passwordHash: "" }, include: { memberships: true } });
      const claimed = await tx.teamInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
      if (claimed.count !== 1) throw fail("Undangan sudah digunakan.", 409);
      await tx.organizationUser.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } }, create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role }, update: {} });
      return { data: { accepted: true } };
    });
  });
  app.patch("/v1/team/members/:id", { preHandler: requireAuth }, async request => {
    if (request.userContext!.role !== "OWNER") throw fail("Hanya pemilik dapat mengubah peran.", 403);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { role } = z.object({ role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) }).parse(request.body);
    const changed = await prisma.organizationUser.updateMany({ where: { organizationId: request.userContext!.organizationId, userId: id, role: { not: "OWNER" } }, data: { role } });
    if (!changed.count) throw fail("Anggota tidak ditemukan atau merupakan pemilik.", 409);
    return { data: { updated: true } };
  });
}
