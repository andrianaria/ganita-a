import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ingestTransactions } from "../ingest.js";
import { requireScope } from "../auth.js";

const itemSchema = z.object({
  externalId: z.string().optional(),
  productExternalId: z.string().optional(),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  netAmount: z.number().nonnegative(),
  unitCost: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),
});

const transactionSchema = z.object({
  externalId: z.string().min(1),
  transactionNumber: z.string().optional(),
  outletCode: z.string().min(1),
  occurredAt: z.coerce.date(),
  grossSales: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  serviceCharge: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  netSales: z.number().nonnegative(),
  totalCost: z.number().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(["COMPLETED", "PAID", "VOID", "CANCELLED", "REFUNDED"]).default("COMPLETED"),
  items: z.array(itemSchema).min(1),
});

const importSchema = z.object({
  sourceName: z.string().min(1).optional(),
  sourceType: z
    .enum(["STREET_SUSHI_POS", "GANITA_POS", "CSV", "OTHER"])
    .default("CSV"),
  rows: z.array(transactionSchema).min(1).max(5000),
});

export async function importRoutes(app: FastifyInstance) {
  const handleTransactionImport = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = importSchema.parse(request.body);
    const boundSource = request.userContext!.apiKeyDataSourceId;
    if (!boundSource && !body.sourceName) return reply.code(400).send({ error: { code: "SOURCE_REQUIRED", message: "Nama sumber diperlukan untuk sesi pengguna atau API key lama." } });
    const data = await ingestTransactions(request.userContext!.organizationId, boundSource ? { id: boundSource } : { name: body.sourceName!, type: body.sourceType }, body.rows);
    return reply.code(201).send({ data });
  };
  app.post("/v1/imports/transactions", { preHandler: requireScope("sales:write") }, handleTransactionImport);
  app.post("/v1/imports/csv/transactions", { preHandler: requireScope("sales:write") }, handleTransactionImport);
}
