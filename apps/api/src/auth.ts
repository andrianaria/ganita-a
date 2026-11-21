import { createHash, randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@ganita-ai/database";
import { createClerkClient, verifyToken } from "@clerk/backend";

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  apiKeyScopes?: string[];
  apiKeyDataSourceId?: string;
  authVersion?: number;
  clerkSessionId?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    userContext?: AuthenticatedUser;
  }
}

export function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const scrypt = promisify(scryptCallback);
export async function encodePassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = await scrypt(value, salt, 64) as Buffer;
  return `scrypt:${salt}:${digest.toString("hex")}`;
}

export async function verifyPassword(value: string, stored: string) {
  if (/^[a-f0-9]{64}$/.test(stored)) {
    return timingSafeEqual(Buffer.from(hashPassword(value), "hex"), Buffer.from(stored, "hex"));
  }
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(await scrypt(value, salt, 64) as Buffer, Buffer.from(hash, "hex"));
}

export function accessError(context: AuthenticatedUser, method: string, path: string) {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (context.apiKeyScopes) {
    const scope = path.includes("transactions") || path.includes("imports") || path.includes("expenses") ? "sales:write"
      : /\/(ingredients|recipes|recipe-items|stock-|suppliers)/.test(path) || /\/products\/[^/]+\/recipe$/.test(path) ? "inventory:write"
      : /\/(products|brands|outlets|data-sources|integrations\/erp)/.test(path) ? "master:write" : null;
    if (!scope || !context.apiKeyScopes.includes(scope)) return "API key tidak memiliki izin untuk operasi ini.";
  } else if (write && path !== "/v1/auth/logout") {
    if (context.role === "VIEWER") return "Akun hanya memiliki akses baca.";
    if (/\/(organizations|api-keys|data-sources|team)/.test(path) && !["OWNER", "ADMIN"].includes(context.role)) return "Operasi ini memerlukan pemilik atau admin.";
  }
  return null;
}

export function issueToken(payload: AuthenticatedUser, secret: string) {
  return jwt.sign(payload, secret, { expiresIn: "12h", jwtid: randomUUID() });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Missing bearer token" } });
  }

  const bearer = header.slice("Bearer ".length);
  if (bearer.startsWith("ganita_live_")) {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hashPassword(bearer) },
    });
    if (!apiKey || apiKey.revokedAt) {
      return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } });
    }
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
    request.userContext = {
      userId: `api-key:${apiKey.id}`,
      organizationId: apiKey.organizationId,
      role: "ADMIN",
      apiKeyScopes: apiKey.scopes,
      apiKeyDataSourceId: apiKey.dataSourceId ?? undefined,
    };
  } else {
    let decoded: AuthenticatedUser | undefined;
    try {
      decoded = jwt.verify(bearer, request.server.config.JWT_SECRET, { algorithms: ["HS256"] }) as AuthenticatedUser;
    } catch { /* Clerk sessions use their own issuer and signing keys. */ }
    if (decoded) {
    const membership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: decoded.organizationId, userId: decoded.userId } },
      include: { user: true },
    });
    if (!membership || membership.user.status !== "ACTIVE" || membership.user.clerkUserId || decoded.authVersion !== membership.user.authVersion) {
      return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Organization access denied" } });
    }
    request.userContext = { ...decoded, role: membership.role };
    } else {
      const identity = await getClerkIdentity(request);
      if (!identity) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Sesi tidak valid atau kedaluwarsa." } });
      const user = await prisma.user.findUnique({ where: { clerkUserId: identity.clerkUserId }, include: { memberships: true } });
      if (!user || !user.memberships.length) return reply.code(409).send({ error: { code: "ONBOARDING_REQUIRED", message: "Selesaikan onboarding terlebih dahulu." } });
      if (user.status !== "ACTIVE") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Akun tidak aktif." } });
      if (user.memberships.length !== 1) return reply.code(409).send({ error: { code: "WORKSPACE_REQUIRED", message: "Akun memiliki beberapa workspace; pemilihan workspace diperlukan." } });
      const membership = user.memberships[0];
      request.userContext = { userId: user.id, organizationId: membership.organizationId, role: membership.role, clerkSessionId: identity.sessionId };
    }
  }
  const denied = accessError(request.userContext!, request.method, request.routeOptions.url ?? request.url);
  if (denied) return reply.code(403).send({ error: { code: "FORBIDDEN", message: denied } });
  const source = request.userContext!.apiKeyDataSourceId;
  if (source) {
    const path = request.routeOptions.url ?? request.url;
    const params = request.params as { id?: string };
    const body = request.body as { dataSourceId?: unknown } | undefined;
    const query = request.query as { dataSourceId?: unknown };
    const explicitSources = [request.headers["x-ganita-data-source-id"], body?.dataSourceId, query?.dataSourceId,
      path.startsWith("/v1/data-sources/:id") ? params?.id : undefined];
    if (explicitSources.some(value => value !== undefined && value !== source)) {
      return reply.code(403).send({ error: { code: "DATA_SOURCE_MISMATCH", message: "API key ini hanya dapat mengirim data melalui koneksinya sendiri." } });
    }
    if (path === "/v1/data-sources" && request.method === "POST") {
      return reply.code(403).send({ error: { code: "SOURCE_ALREADY_BOUND", message: "Koneksi API key sudah tersedia. Tidak perlu membuat sumber data baru." } });
    }
  }
}

export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    if (request.userContext?.userId.startsWith("api-key:") && !request.userContext.apiKeyScopes?.includes(scope)) {
      return reply.code(403).send({ error: { code: "INSUFFICIENT_SCOPE", message: `API key requires ${scope}` } });
    }
  };
}

export async function getClerkIdentity(request: FastifyRequest) {
  const header = request.headers.authorization;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!header?.startsWith("Bearer ") || !secretKey) return null;
  try {
    const payload = await verifyToken(header.slice("Bearer ".length), { secretKey });
    if (!payload.sub || !payload.sid) return null;
    const client = createClerkClient({ secretKey });
    const session = await client.sessions.getSession(payload.sid);
    if (session.status !== "active" || session.userId !== payload.sub) return null;
    const clerkUser = await client.users.getUser(payload.sub);
    if (clerkUser.banned || clerkUser.locked || clerkUser.primaryEmailAddress?.verification?.status !== "verified") return null;
    return {
      clerkUserId: payload.sub,
      sessionId: payload.sid,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || undefined
    };
  } catch {
    return null;
  }
}
