import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { timezoneSchema, businessTypeSchema } from "../validation.js";
import { prisma } from "@ganita-ai/database";
import { slugify } from "@ganita-ai/shared";
import { getClerkIdentity } from "../auth.js";

const profileSchema = z.object({
  fullName: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  businessType: businessTypeSchema,
  timezone: timezoneSchema,
  currency: z.string().regex(/^[A-Z]{3}$/)
});
const onboardingSchema = z.preprocess(input => {
  if (input && typeof input === "object" && !Array.isArray(input)) return { mode: "manual", ...input };
  return input;
}, z.discriminatedUnion("mode", [
  profileSchema.extend({ mode: z.literal("integration") }),
  profileSchema.extend({
    mode: z.literal("manual"),
    outletName: z.string().trim().min(1), outletCode: z.string().trim().min(1),
    address: z.string().trim().min(1), city: z.string().trim().min(1), country: z.string().trim().min(1),
  }),
]));

export async function onboardingRoutes(app: FastifyInstance) {
  app.post("/v1/onboarding", async (request, reply) => {
    const identity = await getClerkIdentity(request);
    if (!identity) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Valid Clerk session required" } });
    const body = onboardingSchema.parse(request.body);
    const email = identity.email?.toLowerCase() ?? `${identity.clerkUserId}@clerk.local`;

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { clerkUserId: identity.clerkUserId }, include: { memberships: true } });
      if (existingUser && (existingUser.status !== "ACTIVE" || existingUser.memberships.length > 1 || existingUser.memberships.some(m => !["OWNER", "ADMIN"].includes(m.role)))) throw Object.assign(new Error("Akses onboarding ditolak."), { statusCode: 403 });
      const user = existingUser
        ? await tx.user.update({ where: { id: existingUser.id }, data: { clerkUserId: identity.clerkUserId, email, name: body.fullName || identity.name || existingUser.name } })
        : await tx.user.create({ data: { clerkUserId: identity.clerkUserId, email, name: body.fullName, passwordHash: "" } });
      const membership = existingUser?.memberships[0];
      const organization = membership
        ? await tx.organization.update({ where: { id: membership.organizationId }, data: { name: body.companyName, businessType: body.businessType, timezone: body.timezone, currency: body.currency.split(" ")[0] } })
        : await tx.organization.create({ data: { name: body.companyName, businessType: body.businessType, slug: `${slugify(body.companyName)}-${identity.clerkUserId.slice(-6).toLowerCase()}`, timezone: body.timezone, currency: body.currency.split(" ")[0] } });
      if (!membership) await tx.organizationUser.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER" } });
      const brand = await tx.brand.upsert({ where: { organizationId_slug: { organizationId: organization.id, slug: slugify(body.companyName) } }, update: { name: body.companyName }, create: { organizationId: organization.id, name: body.companyName, slug: slugify(body.companyName) } });
      let outlet = null;
      if (body.mode === "manual") {
        const outletDetails = { name: body.outletName, timezone: body.timezone, brandId: brand.id, address: body.address, city: body.city, country: body.country };
        outlet = await tx.outlet.upsert({ where: { organizationId_code: { organizationId: organization.id, code: body.outletCode } }, update: outletDetails, create: { ...outletDetails, organizationId: organization.id, code: body.outletCode } });
      }
      return { user, organization, outlet, role: membership?.role ?? "OWNER" as const };
    });

    return reply.code(201).send({ data: { token: request.headers.authorization!.slice(7), user: { id: result.user.id, clerkUserId: result.user.clerkUserId, email: result.user.email, name: result.user.name }, organization: result.organization, outlet: result.outlet } });
  });
}
