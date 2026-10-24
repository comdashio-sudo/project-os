// The documented REST API of the integration layer (work order 12, items 8 and 9), mounted at /api/v1.
// ONE table describes every route (method, path, power it needs, request shape, what it does); the Express router and the OpenAPI document are both made from it, so the
// document cannot drift from what is served (a test compares them). Authentication is a company API key in `Authorization: Bearer pos_…`; the key's powers, its calls per
// minute, and the company it belongs to decide everything — a key sees and writes its own company only, and the database holds that again (row-level security).
import type { NextFunction, Request, RequestHandler, Response } from "express";
import express, { Router } from "express";
import { z } from "zod";
import { runWithDbContext } from "../_core/database";
import { getDb } from "../db";
import { authenticateApiKey, consumeApiRate, type ApiScope, type AuthenticatedKey } from "./apiKeys";
import { applyExternalBatch } from "./external";
import { csvTemplate, csvToRecords, CSV_ENTITIES } from "./csv";
import { applyErpBatch, type ErpEntity } from "./erpInbound";
import { EXPORT_ENTITIES, exportEntity, type ExportEntity } from "./erpOutbound";
import { listMappings, MAPPING_TYPES, saveMappings, type MappingType } from "./mappings";
import { listSyncItems, listSyncRuns } from "./sync";

const id = z.string().trim().min(1).max(120);
const system = z.string().regex(/^[a-z0-9_]{2,24}$/).default("generic").describe("The calling system's short name (odoo, sap_b1, …); it keeps one system's identifiers apart from another's.");
const day = z.string().describe("ISO 8601 date or date-time");
const batch = <T extends z.ZodType>(record: T) => z.object({ system, records: z.array(record).min(1).max(500) });

const supplier = z.object({ externalId: id, code: z.string().trim().min(1).max(80), legalName: z.string().trim().min(1).max(240), contactName: z.string().max(160).optional(), contactEmail: z.string().max(254).optional(), contactPhone: z.string().max(60).optional(), active: z.boolean().optional() });
const purchaseOrder = z.object({ externalId: id, project: id.describe("Project code, or the ERP's cost-center id once mapped"), number: id, supplier: id.optional().describe("Supplier code, or the ERP's supplier id once mapped"), supplierName: z.string().max(240).optional(), orderDate: day, amount: z.number().positive(), currency: z.literal("SAR").optional(), summary: z.string().max(2000).optional(), costCode: id.optional() });
const actualCost = z.object({ externalId: id, project: id, costCode: id.describe("WBS code, or the ERP's cost code once mapped"), amount: z.number(), incurredAt: day, category: z.enum(["materials", "labour", "subcontract", "other"]).optional(), description: z.string().max(500).optional() });
const generic = z.object({ externalId: id }).passthrough();
const externalSubmittal = z.object({ externalId: id, project: id, type: z.enum(["shop_drawing", "material_approval", "method_statement", "sample"]), number: id, revision: z.number().int().min(0).max(99).optional(), title: z.string().min(1).max(255), sentAt: day.optional(), dueAt: day.optional(), repliedAt: day.optional(), replyCode: z.string().max(8).optional(), replyNote: z.string().max(500).optional(), material: id.optional(), unit: z.number().int().positive().optional(), consultant: z.string().trim().max(160).optional(), activity: id.optional() });
const externalInspection = z.object({ externalId: id, project: id, requestCode: id, units: z.array(z.number().int().positive()).min(1).max(200), activity: id, requestedAt: day, responseCode: z.enum(["A", "B", "C", "UR"]).nullable().optional(), contractor: z.string().max(255).optional(), consultant: z.string().max(255).optional() });
const mappingBody = z.object({ system, records: z.array(z.object({ externalId: id, ref: id.describe("Our code for it"), project: id.optional().describe("Required for cost_code: the project whose WBS item it is") })).min(1).max(1000) });

type RouteHandler = (req: Request, res: Response, key: AuthenticatedKey) => Promise<unknown>;
type Route = { method: "get" | "post" | "put"; path: string; scope: ApiScope | null; summary: string; body?: z.ZodType; query?: Record<string, string>; handler: RouteHandler };

const fail = (res: Response, status: number, code: string, extra: Record<string, unknown> = {}) => res.status(status).json({ code, requestId: res.locals?.requestId, ...extra });
const erpHandler = (entity: ErpEntity): RouteHandler => async (req, res, key) => {
  const body = req.body as { system: string; records: unknown[] };
  return res.status(200).json(await applyErpBatch({ actor: { tenantId: key.tenantId, apiKeyId: key.keyId }, system: body.system, entity, records: body.records }));
};

export const routes: Route[] = [
  { method: "get", path: "/ping", scope: null, summary: "Check the key: which company, which powers, how many calls a minute.", handler: async (_req, res, key) => res.json({ ok: true, key: key.name, tenantId: key.tenantId, scopes: key.scopes, rateLimitPerMinute: key.rateLimitPerMinute }) },
  ...(["suppliers", "purchase-orders", "actual-costs", "invoices", "payments", "employee-costs"] as const).map((entity): Route => ({
    method: "post", path: `/erp/${entity}`, scope: "erp.write", handler: erpHandler(entity),
    summary: { suppliers: "Send suppliers from the ERP (created or updated by the ERP's own id).", "purchase-orders": "Send purchase orders: they arrive as drafts; only a draft is updated by a later send.", "actual-costs": "Send actual costs: posted on an existing WBS item, never changed once posted.", invoices: "Send supplier invoices: kept as received (the platform has no table for them), reported \"stored\".", payments: "Send payments: kept as received, reported \"stored\".", "employee-costs": "Send employee cost: kept as received, reported \"stored\"." }[entity],
    body: batch({ suppliers: supplier, "purchase-orders": purchaseOrder, "actual-costs": actualCost, invoices: generic, payments: generic, "employee-costs": generic }[entity]),
  })),
  { method: "get", path: "/erp/csv-template/:entity", scope: "erp.write", summary: `The standard CSV template for an entity (${CSV_ENTITIES.join(", ")}): a header row and one synthetic example row.`, handler: async (req, res) => {
    const entity = req.params.entity as ErpEntity;
    if (!CSV_ENTITIES.includes(entity)) return fail(res, 404, "PROJECT_OS_API_CSV_ENTITY_UNKNOWN");
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${entity}-template.csv"`);
    return res.status(200).send(csvTemplate(entity));
  } },
  { method: "post", path: "/erp/csv/:entity", scope: "erp.write", summary: "Upload the standard CSV (Content-Type: text/csv; query `system` names the source). Rows that can be read are applied exactly as an API batch is; rows that cannot are returned with their line and why.", query: { system: "the source system's short name (default generic)" }, handler: async (req, res, key) => {
    const entity = req.params.entity as ErpEntity;
    if (!CSV_ENTITIES.includes(entity)) return fail(res, 404, "PROJECT_OS_API_CSV_ENTITY_UNKNOWN");
    const system = typeof req.query.system === "string" ? req.query.system : "generic";
    if (!/^[a-z0-9_]{2,24}$/.test(system)) return fail(res, 400, "PROJECT_OS_API_VALIDATION", { field: "system" });
    if (typeof req.body !== "string") return fail(res, 415, "PROJECT_OS_API_CSV_CONTENT_TYPE");
    let parsed: ReturnType<typeof csvToRecords>;
    try { parsed = csvToRecords(entity, req.body); } catch (error) { return fail(res, 400, error instanceof Error ? error.message : "CSV_INVALID"); }
    if (!parsed.records.length) return fail(res, 400, parsed.errors[0]?.reason ?? "CSV_EMPTY", { rowErrors: parsed.errors.slice(0, 50) });
    const applied = await applyErpBatch({ actor: { tenantId: key.tenantId, apiKeyId: key.keyId }, system, entity, records: parsed.records });
    return res.status(200).json({ ...applied, unreadableRows: parsed.errors.length, rowErrors: parsed.errors.slice(0, 50) });
  } },
  { method: "post", path: "/external/submittals", scope: "external.write", summary: "Send consultant submittals from a submittal system (created or updated by that system's id; the reply code must be one of the company's codes).", body: batch(externalSubmittal), handler: async (req, res, key) => { const body = req.body as { system: string; records: unknown[] }; return res.status(200).json(await applyExternalBatch({ actor: { tenantId: key.tenantId, apiKeyId: key.keyId }, system: body.system, entity: "submittals", records: body.records })); } },
  { method: "post", path: "/external/inspections", scope: "external.write", summary: "Send inspection requests and their answers from a quality system (an answer in the company's accepted codes is the acceptance the quality gate reads).", body: batch(externalInspection), handler: async (req, res, key) => { const body = req.body as { system: string; records: unknown[] }; return res.status(200).json(await applyExternalBatch({ actor: { tenantId: key.tenantId, apiKeyId: key.keyId }, system: body.system, entity: "inspections", records: body.records })); } },
  { method: "put", path: "/mappings/:type", scope: "mappings.write", summary: `Map the other system's identifiers to ours. :type is one of ${MAPPING_TYPES.join(", ")}.`, body: mappingBody, handler: async (req, res, key) => {
    const type = req.params.type as MappingType;
    if (!(MAPPING_TYPES as readonly string[]).includes(type)) return fail(res, 404, "PROJECT_OS_API_MAPPING_TYPE_UNKNOWN");
    const body = req.body as z.infer<typeof mappingBody>;
    return res.status(200).json(await saveMappings({ tenantId: key.tenantId, apiKeyId: key.keyId, system: body.system, type, records: body.records }));
  } },
  { method: "get", path: "/mappings", scope: "sync.read", summary: "The mappings the company has made.", query: { system: "string", type: MAPPING_TYPES.join("|") }, handler: async (req, res, key) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !(MAPPING_TYPES as readonly string[]).includes(type)) return fail(res, 400, "PROJECT_OS_API_VALIDATION", { field: "type" });
    return res.json({ items: await listMappings({ tenantId: key.tenantId, system: typeof req.query.system === "string" ? req.query.system : undefined, type: type as MappingType | undefined }) });
  } },
  { method: "get", path: "/export/:entity", scope: "export.read", summary: `Read what the platform holds for the ERP: ${EXPORT_ENTITIES.join(", ")}. Paged with \`after\`; \`updated_since\` asks only for what changed.`, query: { project: "project code", updated_since: "ISO date-time", after: "token from the previous page", limit: "1-1000 (default 500)" }, handler: async (req, res, key) => {
    const entity = req.params.entity as ExportEntity;
    if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) return fail(res, 404, "PROJECT_OS_API_EXPORT_UNKNOWN");
    const since = typeof req.query.updated_since === "string" ? new Date(req.query.updated_since) : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    if ((since && Number.isNaN(since.getTime())) || (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 1000))) return fail(res, 400, "PROJECT_OS_API_VALIDATION");
    const result = await exportEntity({ tenantId: key.tenantId, apiKeyId: key.keyId, entity, query: { project: typeof req.query.project === "string" ? req.query.project : undefined, updatedSince: since, after: typeof req.query.after === "string" ? req.query.after : undefined, limit } });
    if (result.unknownProject) return fail(res, 404, "PROJECT_OS_API_PROJECT_UNKNOWN");
    return res.json({ items: result.items, next: result.next });
  } },
  { method: "get", path: "/sync/runs", scope: "sync.read", summary: "The log of exchanges: each run with how many records arrived, were accepted and were refused.", query: { limit: "1-200" }, handler: async (req, res, key) => { const db = await getDb(); const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50; return res.json({ items: await listSyncRuns(db!, key.tenantId, Number.isFinite(limit) ? limit : 50) }); } },
  { method: "get", path: "/sync/runs/:runId/items", scope: "sync.read", summary: "One run's records: what became of each, and why a refused one was refused.", query: { outcome: "created|updated|unchanged|stored|rejected" }, handler: async (req, res, key) => {
    const db = await getDb(); const outcome = typeof req.query.outcome === "string" ? req.query.outcome : undefined;
    if (outcome && !["created", "updated", "unchanged", "stored", "rejected"].includes(outcome)) return fail(res, 400, "PROJECT_OS_API_VALIDATION", { field: "outcome" });
    return res.json({ items: await listSyncItems(db!, key.tenantId, String(req.params.runId), outcome as never) });
  } },
];

const bearer = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];

/** Authenticates, counts the call against the key's minute, and runs the rest of the request inside the key's company context. */
const authenticated = (route: Route): RequestHandler => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = await authenticateApiKey(bearer(req));
    if (!key) return fail(res, 401, "PROJECT_OS_API_KEY_INVALID");
    const rate = await consumeApiRate(key);
    res.setHeader("RateLimit-Remaining", String(rate.remaining));
    if (!rate.allowed) { res.setHeader("Retry-After", String(rate.retryAfterSeconds)); return fail(res, 429, "PROJECT_OS_API_RATE_LIMITED", { retryAfterSeconds: rate.retryAfterSeconds }); }
    if (route.scope && !key.scopes.includes(route.scope)) return fail(res, 403, "PROJECT_OS_API_SCOPE_MISSING", { scope: route.scope });
    if (route.body) {
      const parsed = route.body.safeParse(req.body);
      if (!parsed.success) return fail(res, 400, "PROJECT_OS_API_VALIDATION", { issues: parsed.error.issues.slice(0, 10).map(issue => ({ path: issue.path.join("."), message: issue.message })) });
      req.body = parsed.data;
    }
    res.locals.apiKey = key;
    await runWithDbContext({ userId: null, tenantIds: [key.tenantId], system: false }, async () => { await route.handler(req, res, key); });
  } catch (error) { next(error); }
};

export function integrationApiRouter(): Router {
  const router = Router();
  router.use(express.text({ type: "text/csv", limit: "5mb" }));
  router.get("/openapi.json", (_req, res) => { res.setHeader("Cache-Control", "public, max-age=300"); res.json(openApiDocument()); });
  for (const route of routes) router[route.method](route.path, authenticated(route));
  // anything else under /api/v1 is a JSON 404, not a page
  router.use((_req, res) => fail(res, 404, "PROJECT_OS_NOT_FOUND"));
  return router;
}

// ------------------------------------------------------------------------------------------------------------------------------------ OpenAPI

const SCOPE_TEXT: Record<ApiScope, string> = { "erp.write": "Send suppliers, purchase orders, actual costs, invoices, payments, employee cost", "erp.read": "(reserved)", "export.read": "Read budgets, commitments, progress, valuations", "external.write": "Send submittals and inspections from other systems", "mappings.write": "Map the other system's identifiers to ours", "sync.read": "Read the exchange log and the mappings" };

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, "{$1}");
    const parameters = [
      ...Array.from(route.path.matchAll(/:(\w+)/g)).map(match => ({ name: match[1], in: "path", required: true, schema: { type: "string" } })),
      ...Object.entries(route.query ?? {}).map(([name, description]) => ({ name, in: "query", required: false, description, schema: { type: "string" } })),
    ];
    (paths[path] ??= {})[route.method] = {
      summary: route.summary,
      security: [{ bearerAuth: [] }],
      ...(route.scope ? { "x-required-scope": route.scope } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(route.body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(route.body, { io: "input", unrepresentable: "any" }) } } } } : {}),
      responses: { "200": { description: "OK" }, "400": { description: "PROJECT_OS_API_VALIDATION: the body or query is not in the documented shape" }, "401": { description: "PROJECT_OS_API_KEY_INVALID" }, "403": { description: "PROJECT_OS_API_SCOPE_MISSING: the key lacks the power this call needs" }, "429": { description: "PROJECT_OS_API_RATE_LIMITED: see Retry-After" } },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Dashio / PROJECT OS integration API", version: "1.0.0", description: "A company's other systems (ERP, submittal and quality systems) exchange data with its Dashio company here. Every call carries a company API key; a batch is idempotent by the other system's own identifier; every record's outcome is in the sync log. Webhooks: events are POSTed as JSON with the header `X-ProjectOS-Signature: t=<unix>,v1=<hex HMAC-SHA256 of \"<t>.<body>\" with the endpoint secret>`." },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "A company API key (pos_…) made by the company's manager. Powers: " + (Object.entries(SCOPE_TEXT).map(([scope, text]) => `${scope} (${text})`).join("; ")) } } },
    paths: { "/openapi.json": { get: { summary: "This document.", responses: { "200": { description: "OK" } } } }, ...paths },
    "x-webhook-events": ["daily_report.approved", "submittal.replied", "material.issued", "sync.completed", "webhook.test"],
  };
}
