import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { timezoneSchema, businessTypeSchema, targetsSchema } from "../validation.js";
import { prisma } from "@ganita-ai/database";
import { slugify } from "@ganita-ai/shared";
import { requireAuth } from "../auth.js";
import { assertTenantReferences } from "../tenant.js";
import { openingHoursSchema, requireOutletAdmin, assertEmptyOutlet } from "../outlet-management.js";

const createBrandSchema = z.object({ name: z.string().min(1) });
const createOutletSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(50),
  externalId: z.string().optional(),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  notes: z.string().trim().max(2000).optional(),
  openingHours: openingHoursSchema.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  timezone: timezoneSchema.default("Asia/Jakarta")
});
const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  businessType: businessTypeSchema.optional(),
  timezone: timezoneSchema.optional(),
  currency: z.string().min(3).max(10).optional(),
  settings: z.object({
    targets: targetsSchema.optional(),
    notifications: z.object({ health: z.boolean(), stock: z.boolean(), sales: z.boolean() }).optional(),
  }).optional(),
});

export async function organizationRoutes(app: FastifyInstance) {
  app.get("/v1/organizations/current", { preHandler: requireAuth }, async (request) => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: request.userContext!.organizationId } });
    return { data: organization };
  });

  app.patch("/v1/organizations/current", { preHandler: requireAuth }, async (request, reply) => {
    const body = updateOrganizationSchema.parse(request.body);
    const current = await prisma.organization.findUniqueOrThrow({ where: { id: request.userContext!.organizationId } });
    const nextSettings = body.settings ? { ...(current.settings as object), ...body.settings } : undefined;
    const organization = await prisma.organization.update({
      where: { id: current.id },
      data: {
        name: body.name,
        businessType: body.businessType,
        timezone: body.timezone,
        currency: body.currency?.split(" ")[0],
        settings: nextSettings,
      },
    });
    return reply.send({ data: organization });
  });

  app.get("/v1/brands", { preHandler: requireAuth }, async (request) => {
    const brands = await prisma.brand.findMany({ where: { organizationId: request.userContext!.organizationId }, orderBy: { name: "asc" } });
    return { data: brands };
  });

  app.post("/v1/brands", { preHandler: requireAuth }, async (request, reply) => {
    const body = createBrandSchema.parse(request.body);
    const brand = await prisma.brand.create({
      data: { organizationId: request.userContext!.organizationId, name: body.name, slug: slugify(body.name) }
    });
    return reply.code(201).send({ data: brand });
  });

  app.get("/v1/outlets", { preHandler: requireAuth }, async (request) => {
    const outlets = await prisma.outlet.findMany({
      where: { organizationId: request.userContext!.organizationId },
      include: { healthSnapshots: { orderBy: { snapshotDate: "desc" }, take: 1 }, dataSourceLinks: { include: { dataSource: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" }
    });
    return { data: outlets };
  });

  app.post("/v1/outlets", { preHandler: requireAuth }, async (request, reply) => {
    const body = createOutletSchema.parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const outlet = await prisma.outlet.create({
      data: {
        organizationId: request.userContext!.organizationId,
        brandId: body.brandId,
        name: body.name,
        code: body.code,
        externalId: body.externalId,
        address: body.address,
        city: body.city,
        country: body.country,
        phone: body.phone,
        email: body.email,
        notes: body.notes,
        openingHours: body.openingHours,
        status: body.status,
        profileManagedLocally: !request.userContext!.apiKeyScopes,
        timezone: body.timezone
      }
    });
    return reply.code(201).send({ data: outlet });
  });

  app.get("/v1/outlets/:id", { preHandler: requireAuth }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const outlet = await prisma.outlet.findFirstOrThrow({
      where: { id: params.id, organizationId: request.userContext!.organizationId },
      include: { brand: true, healthSnapshots: { orderBy: { snapshotDate: "desc" }, take: 1 } }
    });
    return { data: outlet };
  });

  app.patch("/v1/outlets/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createOutletSchema.partial().extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).parse(request.body);
    await assertTenantReferences(request.userContext!.organizationId, body);
    const organizationId = request.userContext!.organizationId;
    const outlet = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      return tx.outlet.update({ where: { id, organizationId }, data: { ...body, ...(!request.userContext!.apiKeyScopes ? { profileManagedLocally: true } : {}) } });
    });
    return { data: outlet };
  });

  app.delete("/v1/outlets/:id", { preHandler: requireOutletAdmin }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const organizationId = request.userContext!.organizationId;
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      await tx.$queryRaw`SELECT id FROM outlets WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      await assertEmptyOutlet(tx, organizationId, id);
      if (await tx.outletDataSource.count({ where: { organizationId, outletId: id } })) {
        throw Object.assign(new Error("Outlet masih terhubung ke sistem asal. Pindahkan pemetaan sebelum menghapus outlet."), { statusCode: 409 });
      }
      await tx.outlet.delete({ where: { id, organizationId } });
    });
    return { data: { id, deleted: true } };
  });
}
