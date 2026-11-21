import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { timezoneSchema } from "../validation.js";
import { prisma } from "@ganita-ai/database";
import { requireScope } from "../auth.js";
import { ingestTransactions } from "../ingest.js";

const outletRecordSchema = z.object({
  external_id: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  timezone: timezoneSchema.default("Asia/Jakarta"),
  active: z.boolean().default(true),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    country: z.string().max(2).default("ID"),
  }).optional(),
});

const outletBatchSchema = z.object({
  batch_id: z.string().min(1).max(255),
  resource: z.literal("outlets").default("outlets"),
  mode: z.enum(["upsert"]).default("upsert"),
  snapshot: z.boolean().default(false),
  records: z.array(outletRecordSchema).max(1000),
  meta: z.object({
    source: z.string().min(1).max(255),
    source_version: z.string().max(50).optional(),
    sent_at: z.coerce.date().optional(),
  }),
});

const transactionItemSchema = z.object({
  external_id: z.string().max(255).optional(),
  product_external_id: z.string().max(255).optional(),
  product_name_snapshot: z.string().min(1).max(255),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  gross_amount: z.number().nonnegative(),
  discount_amount: z.number().nonnegative().default(0),
  net_amount: z.number().nonnegative(),
  unit_cost: z.number().nonnegative().optional(),
  total_cost: z.number().nonnegative().optional(),
});

const transactionRecordSchema = z.object({
  external_id: z.string().min(1).max(255),
  transaction_number: z.string().max(255).optional(),
  outlet_external_id: z.string().min(1).max(255),
  occurred_at: z.coerce.date(),
  gross_sales: z.number().nonnegative(),
  discount_amount: z.number().nonnegative().default(0),
  service_charge: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  net_sales: z.number().nonnegative(),
  total_cost: z.number().nonnegative().optional(),
  payment_method: z.string().max(100).optional(),
  status: z.enum(["COMPLETED", "PAID", "VOID", "CANCELLED", "REFUNDED"]).default("COMPLETED"),
  items: z.array(transactionItemSchema).min(1),
});

const transactionBatchSchema = z.object({
  batch_id: z.string().min(1).max(255),
  resource: z.literal("transactions").default("transactions"),
  mode: z.enum(["upsert"]).default("upsert"),
  records: z.array(transactionRecordSchema).min(1).max(1000),
  meta: z.object({ source: z.string().min(1).max(255), source_version: z.string().max(50).optional(), sent_at: z.coerce.date().optional() }),
});

async function upsertOutlets(
  organizationId: string,
  dataSourceId: string,
  records: z.infer<typeof outletRecordSchema>[],
  snapshot: boolean,
) {
  const dataSource = await prisma.dataSource.findFirst({
    where: { id: dataSourceId, organizationId },
  });
  if (!dataSource) return { error: "DATA_SOURCE_NOT_FOUND" as const };

  const brand = (await prisma.brand.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  })) ?? await prisma.brand.create({
    data: {
      organizationId,
      name: dataSource.name || "Default Brand",
      slug: `brand-${organizationId.slice(0, 8)}`,
    },
  });

  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    for (const record of records) {
      const link = await tx.outletDataSource.findUnique({
        where: {
          dataSourceId_externalOutletId: {
            dataSourceId,
            externalOutletId: record.external_id,
          },
        },
        include: { outlet: true },
      });
      const existing = link?.outlet ?? await tx.outlet.findFirst({
        where: { organizationId, code: record.code },
      });
      if (!link && existing && await tx.outletDataSource.count({ where: { dataSourceId, outletId: existing.id } })) {
        throw Object.assign(new Error("Kode outlet sudah terhubung ke ID eksternal lain pada koneksi ini."), { statusCode: 409 });
      }
      const outlet = existing?.profileManagedLocally ? existing : existing
        ? await tx.outlet.update({
          where: { id: existing.id },
          data: {
            name: record.name,
            code: record.code,
            externalId: record.external_id,
            timezone: record.timezone,
            status: record.active ? "ACTIVE" : "INACTIVE",
            address: record.address?.line1,
            city: record.address?.city,
            country: record.address?.country,
          },
        })
        : await tx.outlet.create({
          data: {
            organizationId,
            brandId: brand.id,
            externalId: record.external_id,
            name: record.name,
            code: record.code,
            timezone: record.timezone,
            status: record.active ? "ACTIVE" : "INACTIVE",
            address: record.address?.line1,
            city: record.address?.city,
            country: record.address?.country,
          },
        });
      if (existing) updated += 1;
      else created += 1;

      await tx.outletDataSource.upsert({
        where: {
          dataSourceId_externalOutletId: {
            dataSourceId,
            externalOutletId: record.external_id,
          },
        },
        create: {
          organizationId,
          outletId: outlet.id,
          dataSourceId,
          externalOutletId: record.external_id,
        },
        update: { outletId: outlet.id },
      });
    }
    if (snapshot) {
      const externalIds = records.map((record) => record.external_id);
      const staleLinks = await tx.outletDataSource.findMany({
        where: { dataSourceId, organizationId, externalOutletId: { notIn: externalIds } },
      });
      for (const staleLink of staleLinks) {
        await tx.outlet.updateMany({ where: { id: staleLink.outletId, profileManagedLocally: false }, data: { status: "INACTIVE" } });
      }
    }
  });
  await prisma.dataSource.update({
    where: { id: dataSourceId },
    data: { status: "CONNECTED", lastSyncAt: new Date() },
  });
  return { created, updated };
}

async function upsertTransactions(organizationId: string, dataSourceId: string, records: z.infer<typeof transactionRecordSchema>[]) {
  return ingestTransactions(organizationId, { id: dataSourceId }, records.map(r => ({
    externalId: r.external_id, outletExternalId: r.outlet_external_id, transactionNumber: r.transaction_number,
    occurredAt: r.occurred_at, grossSales: r.gross_sales, discountAmount: r.discount_amount, serviceCharge: r.service_charge,
    taxAmount: r.tax_amount, netSales: r.net_sales, totalCost: r.total_cost, paymentMethod: r.payment_method, status: r.status,
    items: r.items.map(i => ({ externalId: i.external_id, productExternalId: i.product_external_id, productName: i.product_name_snapshot,
      quantity: i.quantity, unitPrice: i.unit_price, grossAmount: i.gross_amount, discountAmount: i.discount_amount,
      netAmount: i.net_amount, unitCost: i.unit_cost, totalCost: i.total_cost }))
  })));
}

export async function integrationRoutes(app: FastifyInstance) {
  app.get("/v1/integrations/erp/context", { preHandler: requireScope("master:write") }, async (request) => {
    const organization = await prisma.organization.findUnique({
      where: { id: request.userContext!.organizationId },
      select: { id: true, name: true, slug: true },
    });
    const dataSources = await prisma.dataSource.findMany({
      where: { organizationId: request.userContext!.organizationId, id: request.userContext!.apiKeyDataSourceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, status: true, lastSyncAt: true },
    });
    return {
      data: {
        organization,
        data_sources: dataSources,
        // Bound keys only discover their own source. Legacy keys retain discovery.
        default_data_source_id: dataSources.length === 1 ? dataSources[0]?.id : null,
        data_source_header_required: !request.userContext!.apiKeyDataSourceId,
      },
    };
  });

  app.get("/v1/integrations/erp/health", { preHandler: requireScope("master:write") }, async (request) => ({
    data: {
      ok: true,
      api_version: "2026-09",
      organization_id: request.userContext!.organizationId,
    },
  }));

  app.get("/v1/integrations/erp/capabilities", { preHandler: requireScope("master:write") }, async () => ({
    data: {
      api_version: "2026-09",
      resources: ["outlets", "transactions"],
      max_batch_size: 1000,
      accepted_currencies: ["IDR"],
    },
  }));

  app.post("/v1/integrations/erp/outlets", { preHandler: requireScope("master:write") }, async (request, reply) => {
    const body = outletBatchSchema.parse(request.body);
    const dataSourceId = request.userContext!.apiKeyDataSourceId ?? request.headers["x-ganita-data-source-id"];
    if (typeof dataSourceId !== "string" || !dataSourceId) {
      return reply.code(400).send({ error: { code: "DATA_SOURCE_REQUIRED", message: "X-Ganita-Data-Source-Id wajib diisi" } });
    }
    const result = await upsertOutlets(request.userContext!.organizationId, dataSourceId, body.records, body.snapshot);
    if ("error" in result) {
      return reply.code(404).send({ error: { code: result.error, message: "Data source tidak ditemukan" } });
    }
    return {
      data: {
        batch_id: body.batch_id,
        resource: "outlets",
        status: "COMPLETED",
        total: body.records.length,
        created: result.created,
        updated: result.updated,
        rejected: 0,
      },
    };
  });

  app.post("/v1/integrations/erp/transactions", { preHandler: requireScope("sales:write") }, async (request, reply) => {
    const body = transactionBatchSchema.parse(request.body);
    const dataSourceId = request.userContext!.apiKeyDataSourceId ?? request.headers["x-ganita-data-source-id"];
    if (typeof dataSourceId !== "string" || !dataSourceId) {
      return reply.code(400).send({ error: { code: "DATA_SOURCE_REQUIRED", message: "X-Ganita-Data-Source-Id wajib diisi" } });
    }
    const result = await upsertTransactions(request.userContext!.organizationId, dataSourceId, body.records);

    return { data: { batch_id: body.batch_id, resource: "transactions", total: body.records.length, ...result } };
  });
}
