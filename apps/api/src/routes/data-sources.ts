import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { timezoneSchema } from "../validation.js";
import { prisma } from "@ganita-ai/database";
import { requireAuth, requireScope } from "../auth.js";
import { assertTenantReferences } from "../tenant.js";
import { assertEmptyOutlet, requireOutletAdmin } from "../outlet-management.js";

const createDataSourceSchema = z.object({
  type: z.enum(["STREET_SUSHI_POS", "GANITA_POS", "CSV", "OTHER"]),
  name: z.string().min(1),
  connectionSecretRef: z.string().optional(),
});

const syncOutletsSchema = z.object({
  outlets: z
    .array(
      z.object({
        externalId: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        code: z.string().min(1).max(50),
        timezone: timezoneSchema.optional(),
      }),
    )
    .min(1)
    .max(1000),
});

class EsbConnector {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}
  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }
  async testConnection() {
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/health`,
        { headers: this.headers(), signal: AbortSignal.timeout(10000) },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
  async getOutlets() {
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/outlets`,
        { headers: this.headers(), signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as {
        data?: Array<{
          id?: string;
          external_id?: string;
          name: string;
          code?: string;
          timezone?: string;
        }>;
      };
      return (body.data ?? []).map((item) => ({
        externalId: item.external_id ?? item.id ?? item.name,
        name: item.name,
        code: item.code,
        timezone: item.timezone,
      }));
    } catch {
      return [];
    }
  }
}

export async function dataSourceRoutes(app: FastifyInstance) {
  app.get("/v1/data-sources", { preHandler: requireAuth }, async (request) => {
    const dataSources = await prisma.dataSource.findMany({
      where: { organizationId: request.userContext!.organizationId, id: request.userContext!.apiKeyDataSourceId },
      orderBy: { createdAt: "desc" },
    });
    return { data: dataSources };
  });

  app.post(
    "/v1/data-sources",
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = createDataSourceSchema.parse(request.body);
      const dataSource = await prisma.dataSource.create({
        data: {
          organizationId: request.userContext!.organizationId,
          type: body.type,
          name: body.name,
          connectionSecretRef: body.connectionSecretRef,
          status: "DISCONNECTED",
        },
      });
      return reply.code(201).send({ data: dataSource });
    },
  );

  app.post(
    "/v1/data-sources/:id/test",
    { preHandler: requireAuth },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const dataSource = await prisma.dataSource.findFirstOrThrow({
        where: {
          id: params.id,
          organizationId: request.userContext!.organizationId,
        },
      });
      const esb =
        dataSource.name.toLowerCase().includes("esb") &&
        process.env.ESB_ORGANIZATION_ID === request.userContext!.organizationId &&
        process.env.ESB_BASE_URL
          ? new EsbConnector(process.env.ESB_BASE_URL, process.env.ESB_API_KEY)
          : undefined;
      const ok = esb ? await esb.testConnection() : Boolean(dataSource.lastSyncAt);
      if (esb) await prisma.dataSource.update({
        where: { id: dataSource.id },
        data: { status: ok ? "CONNECTED" : "ERROR" },
      });
      return { data: { ok, mode: esb ? "REMOTE_HEALTH_CHECK" : "INBOUND", lastSyncAt: dataSource.lastSyncAt } };
    },
  );

  app.post(
    "/v1/data-sources/:id/discover-outlets",
    { preHandler: requireAuth },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const dataSource = await prisma.dataSource.findFirstOrThrow({
        where: {
          id: params.id,
          organizationId: request.userContext!.organizationId,
        },
      });
      const esb =
        dataSource.name.toLowerCase().includes("esb") &&
        process.env.ESB_ORGANIZATION_ID === request.userContext!.organizationId &&
        process.env.ESB_BASE_URL
          ? new EsbConnector(process.env.ESB_BASE_URL, process.env.ESB_API_KEY)
          : undefined;
      return {
        data: esb
            ? await esb.getOutlets()
            : [],
      };
    },
  );

  app.post(
    "/v1/data-sources/:id/sync",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const dataSource = await prisma.dataSource.findFirstOrThrow({
        where: {
          id: params.id,
          organizationId: request.userContext!.organizationId,
        },
      });
      throw Object.assign(new Error("Penarikan data otomatis belum tersedia. Kirim transaksi melalui API atau impor CSV."), { statusCode: 409 });
    },
  );

  app.post(
    "/v1/data-sources/:id/sync-outlets",
    { preHandler: requireScope("master:write") },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = syncOutletsSchema.parse(request.body);
      const organizationId = request.userContext!.organizationId;
      const dataSource = await prisma.dataSource.findFirstOrThrow({
        where: { id: params.id, organizationId },
      });

      const brand =
        (await prisma.brand.findFirst({
          where: { organizationId },
          orderBy: { createdAt: "asc" },
        })) ??
        (await prisma.brand.create({
          data: {
            organizationId,
            name: dataSource.name || "Default Brand",
            slug: `brand-${organizationId.slice(0, 8)}`,
          },
        }));

      let created = 0;
      let updated = 0;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
        for (const sourceOutlet of body.outlets) {
          const link = await tx.outletDataSource.findUnique({
            where: {
              dataSourceId_externalOutletId: {
                dataSourceId: dataSource.id,
                externalOutletId: sourceOutlet.externalId,
              },
            },
            include: { outlet: true },
          });
          const existingOutlet =
            link?.outlet ??
            (await tx.outlet.findFirst({
              where: { organizationId, code: sourceOutlet.code },
            }));

          if (!link && existingOutlet && await tx.outletDataSource.count({ where: { dataSourceId: dataSource.id, outletId: existingOutlet.id } })) {
            throw Object.assign(new Error("Kode outlet sudah terhubung ke ID eksternal lain pada koneksi ini."), { statusCode: 409 });
          }
          const outlet = existingOutlet?.profileManagedLocally ? existingOutlet : existingOutlet
            ? await tx.outlet.update({
                where: { id: existingOutlet.id },
                data: {
                  name: sourceOutlet.name,
                  code: sourceOutlet.code,
                  externalId: sourceOutlet.externalId,
                  timezone: sourceOutlet.timezone ?? existingOutlet.timezone,
                },
              })
            : await tx.outlet.create({
                data: {
                  organizationId,
                  brandId: brand.id,
                  externalId: sourceOutlet.externalId,
                  name: sourceOutlet.name,
                  code: sourceOutlet.code,
                  timezone: sourceOutlet.timezone ?? "Asia/Jakarta",
                },
              });

          if (existingOutlet) updated += 1;
          else created += 1;

          await tx.outletDataSource.upsert({
            where: {
              dataSourceId_externalOutletId: {
                dataSourceId: dataSource.id,
                externalOutletId: sourceOutlet.externalId,
              },
            },
            create: {
              organizationId,
              outletId: outlet.id,
              dataSourceId: dataSource.id,
              externalOutletId: sourceOutlet.externalId,
            },
            update: { outletId: outlet.id },
          });
        }
      });

      return {
        data: {
          dataSourceId: dataSource.id,
          total: body.outlets.length,
          created,
          updated,
          status: "COMPLETED",
        },
      };
    },
  );

  app.get(
    "/v1/data-sources/:id/sync-jobs",
    { preHandler: requireAuth },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const jobs = await prisma.syncJob.findMany({
        where: {
          dataSourceId: params.id,
          organizationId: request.userContext!.organizationId,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { data: jobs };
    },
  );

  app.get("/v1/data-sources/:id/mappings", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await prisma.outletDataSource.findMany({ where: { dataSourceId: id, organizationId: request.userContext!.organizationId }, include: { outlet: true } }) };
  });
  app.post("/v1/data-sources/:id/mappings", { preHandler: requireAuth }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ outletId: z.string().uuid(), externalOutletId: z.string().trim().min(1).max(255) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    await assertTenantReferences(organizationId, { ...body, dataSourceId: id });
    const existing = await prisma.outletDataSource.findUnique({ where: { dataSourceId_externalOutletId: { dataSourceId: id, externalOutletId: body.externalOutletId } } });
    if (existing && existing.outletId !== body.outletId) throw Object.assign(new Error("ID eksternal sudah dipetakan ke outlet lain."), { statusCode: 409 });
    return { data: await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const current = await tx.outletDataSource.findUnique({ where: { dataSourceId_externalOutletId: { dataSourceId: id, externalOutletId: body.externalOutletId } } });
      if (current && current.outletId !== body.outletId) throw Object.assign(new Error("ID eksternal sudah dipetakan ke outlet lain."), { statusCode: 409 });
      if (!current && await tx.outletDataSource.count({ where: { dataSourceId: id, outletId: body.outletId } })) throw Object.assign(new Error("Outlet tujuan sudah dipetakan ke outlet lain pada koneksi ini."), { statusCode: 409 });
      await tx.outlet.update({ where: { id: body.outletId, organizationId }, data: { profileManagedLocally: true } });
      return current ?? tx.outletDataSource.create({ data: { ...body, organizationId, dataSourceId: id } });
    }) };
  });
  app.patch("/v1/data-sources/:id/mappings", { preHandler: requireOutletAdmin }, async request => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ externalOutletId: z.string().min(1).max(255), outletId: z.string().uuid(), previousOutletId: z.string().uuid(), deleteEmptyOutlet: z.boolean().default(false) }).parse(request.body);
    const organizationId = request.userContext!.organizationId;
    await assertTenantReferences(organizationId, { outletId: body.outletId, dataSourceId: id });
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const link = await tx.outletDataSource.findFirstOrThrow({ where: { dataSourceId: id, externalOutletId: body.externalOutletId, organizationId } });
      if (link.outletId !== body.previousOutletId) throw Object.assign(new Error("Pemetaan sudah berubah. Muat ulang sebelum mencoba kembali."), { statusCode: 409 });
      if (link.outletId === body.outletId) throw Object.assign(new Error("Pilih outlet tujuan yang berbeda."), { statusCode: 400 });
      await tx.$queryRaw`SELECT id FROM outlets WHERE id = ${link.outletId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      await assertEmptyOutlet(tx, organizationId, link.outletId);
      const target = await tx.outlet.findFirstOrThrow({ where: { id: body.outletId, organizationId } });
      if (target.status !== "ACTIVE") throw Object.assign(new Error("Outlet tujuan harus aktif."), { statusCode: 409 });
      // Two source outlets must not collapse onto one replay identity.
      if (await tx.outletDataSource.count({ where: { dataSourceId: id, outletId: body.outletId } })) throw Object.assign(new Error("Outlet tujuan sudah dipetakan ke outlet lain pada koneksi ini."), { statusCode: 409 });
      const updated = await tx.outletDataSource.update({ where: { id: link.id }, data: { outletId: body.outletId } });
      await tx.outlet.update({ where: { id: body.outletId }, data: { profileManagedLocally: true } });
      if (body.deleteEmptyOutlet) {
        if (await tx.outletDataSource.count({ where: { outletId: link.outletId } })) throw Object.assign(new Error("Outlet asal masih memiliki pemetaan lain. Lepaskan pilihan hapus outlet."), { statusCode: 409 });
        await tx.outlet.delete({ where: { id: link.outletId, organizationId } });
      }
      return updated;
    });
    return { data: result };
  });
  app.post("/v1/data-sources/:id/jobs/:jobId/retry", { preHandler: requireAuth }, async request => {
    const { id, jobId } = z.object({ id: z.string().uuid(), jobId: z.string().uuid() }).parse(request.params);
    const job = await prisma.syncJob.updateMany({ where: { id: jobId, dataSourceId: id, organizationId: request.userContext!.organizationId, status: "FAILED", type: { not: "TRANSACTION_IMPORT" } }, data: { status: "QUEUED", errorMessage: null, startedAt: null, completedAt: null } });
    if (!job.count) throw Object.assign(new Error("Hanya pekerjaan gagal yang dapat dicoba kembali."), { statusCode: 409 });
    return { data: { queued: true, operation: "RECALCULATE_IMPORTED_DATA" } };
  });
}
