// Connections to a company's other systems (work order 12, items 10 and 11). A connection holds where the system is and how to sign in (sealed, never read back); a CONNECTOR reads that
// system and shapes what it finds as the platform's inbound records, which then go through the same applyErpBatch as a push over the API — the same rules, the same mapping, the same log.
// The registry says which systems have a connector and how honestly each is proven: Odoo is exercised against a real Odoo in CI; the others are written against the vendor's documented API
// and tested against its documented shapes only, so they stay UNVERIFIED until a company with a test account runs them (docs/INTEGRATIONS.md).
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { auditLogs, integrationConnections, integrationMappings, projects, suppliers } from "../../drizzle/schema";
import { withSystemContext } from "../_core/database";
import { logError } from "../_core/logger";
import { assertTenantManager, getDb } from "../db";
import { liveEvm, loadProfitabilityRows } from "../profitability";
import { DEFAULT_EAC_METHOD } from "../profitability";
import { applyErpBatch, type ErpEntity } from "./erpInbound";
import { OdooClient, pullFromOdoo, pushToOdoo, type OdooSettings, type PushMemory } from "./connectors/odoo";
import { vendorClientFor, VENDOR_SYSTEMS, type VendorSettings, type VendorSystem } from "./connectors/vendors";
import { openSecret, sealSecret } from "./secretBox";
import { finishSyncRun, recordSyncItems, stableHash, startSyncRun, type SyncItem } from "./sync";
import { assertSafeWebhookUrl } from "./webhooks";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ConnectorStatus = "PROVEN_IN_CI" | "UNVERIFIED";
export const CONNECTOR_SYSTEMS = ["odoo", ...VENDOR_SYSTEMS] as const;
const isVendor = (system: string): system is VendorSystem => (VENDOR_SYSTEMS as readonly string[]).includes(system);
const VENDOR_PULLS: ErpEntity[] = ["suppliers", "purchase-orders", "invoices", "payments"];
export const connectorRegistry: Record<string, { status: ConnectorStatus; pulls: ErpEntity[]; pushes: string[] }> = {
  odoo: { status: "PROVEN_IN_CI", pulls: ["suppliers", "purchase-orders", "actual-costs", "invoices", "payments"], pushes: ["projects", "suppliers", "progress"] },
  // written against each vendor's documented API and tested against fixtures of its documented shapes; no account of theirs has ever answered (docs/INTEGRATIONS.md)
  sap_b1: { status: "UNVERIFIED", pulls: VENDOR_PULLS, pushes: [] },
  dynamics365: { status: "UNVERIFIED", pulls: VENDOR_PULLS, pushes: [] },
  netsuite: { status: "UNVERIFIED", pulls: VENDOR_PULLS, pushes: [] },
};
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND", message: string) => new TRPCError({ code, message });

export type ConnectionInput = { userId: number; tenantId: string; system: string; name: string; baseUrl: string; database?: string; username?: string; secret: string; settings?: Record<string, unknown>; scheduledDaily?: boolean };

export async function createConnectionForManager(input: ConnectionInput) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  if (!(input.system in connectorRegistry)) throw refuse("BAD_REQUEST", "PROJECT_OS_CONNECTION_SYSTEM_UNSUPPORTED");
  const url = await assertSafeWebhookUrl(input.baseUrl).catch(() => { throw refuse("BAD_REQUEST", "PROJECT_OS_CONNECTION_URL_INVALID"); });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(integrationConnections).values({ id, tenantId: input.tenantId, system: input.system, name: input.name, baseUrl: url.origin, database: input.database ?? null, username: input.username ?? null, secretSealed: sealSecret(input.secret), settings: JSON.stringify(input.settings ?? {}), scheduledDaily: input.scheduledDaily ?? false, createdByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "integration.connection_created", entityType: "integration_connection", entityId: id, metadata: JSON.stringify({ system: input.system, name: input.name, host: url.host, scheduledDaily: input.scheduledDaily ?? false }) });
  });
  return { id };
}

export async function listConnectionsForManager(input: { userId: number; tenantId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const rows = await db.select({ id: integrationConnections.id, system: integrationConnections.system, name: integrationConnections.name, baseUrl: integrationConnections.baseUrl, database: integrationConnections.database, username: integrationConnections.username, settings: integrationConnections.settings, active: integrationConnections.active, scheduledDaily: integrationConnections.scheduledDaily, lastRunAt: integrationConnections.lastRunAt }).from(integrationConnections).where(eq(integrationConnections.tenantId, input.tenantId)).orderBy(desc(integrationConnections.createdAt));
  return rows.map(row => ({ ...row, connector: connectorRegistry[row.system] ?? null }));
}

export async function setConnectionActiveForManager(input: { userId: number; tenantId: string; connectionId: string; active: boolean; scheduledDaily?: boolean }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const changed = await db.update(integrationConnections).set({ active: input.active, ...(input.scheduledDaily === undefined ? {} : { scheduledDaily: input.scheduledDaily }), updatedAt: new Date() }).where(and(eq(integrationConnections.id, input.connectionId), eq(integrationConnections.tenantId, input.tenantId))).returning({ id: integrationConnections.id });
  if (!changed.length) throw refuse("NOT_FOUND", "PROJECT_OS_CONNECTION_NOT_FOUND");
  return { id: input.connectionId, active: input.active };
}

type Connection = typeof integrationConnections.$inferSelect;
async function connectionOf(db: Db, tenantId: string, id: string): Promise<Connection> {
  const [row] = await db.select().from(integrationConnections).where(and(eq(integrationConnections.id, id), eq(integrationConnections.tenantId, tenantId))).limit(1);
  if (!row) throw refuse("NOT_FOUND", "PROJECT_OS_CONNECTION_NOT_FOUND");
  return row;
}
const odooFor = (connection: Connection, fetchImpl?: typeof fetch) => new OdooClient({ baseUrl: connection.baseUrl, database: connection.database ?? "", login: connection.username ?? "", secret: openSecret(connection.secretSealed ?? ""), fetchImpl });
const vendorFor = (connection: Connection, fetchImpl?: typeof fetch) => vendorClientFor(connection.system as VendorSystem, { baseUrl: connection.baseUrl, database: connection.database, username: connection.username, secret: openSecret(connection.secretSealed ?? "") }, settingsOf(connection) as VendorSettings, fetchImpl);
const settingsOf = (connection: Connection): OdooSettings => { try { return JSON.parse(connection.settings ?? "{}") as OdooSettings; } catch { return {}; } };

export async function testConnectionForManager(input: { userId: number; tenantId: string; connectionId: string; fetchImpl?: typeof fetch }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const connection = await connectionOf(db, input.tenantId, input.connectionId);
  try {
    if (isVendor(connection.system)) return { ok: true as const, ...(await vendorFor(connection, input.fetchImpl).test()) };
    const client = odooFor(connection, input.fetchImpl);
    const version = await client.version();
    await client.authenticate();
    return { ok: true as const, serverVersion: version.server_version };
  } catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message.slice(0, 120) : "ERROR" }; }
}

export type SyncDirection = "in" | "out" | "both";
export type ConnectionRunResult = { pulled: Array<{ entity: string; runId: string; status: string; received: number; accepted: number; rejected: number }>; skipped: Array<{ entity: string; externalId: string; reason: string }>; pushed: { runId: string; created: number; updated: number; unchanged: number; rejected: number } | null };

/** Runs one connection now: reads what the other system holds into the platform, and/or writes the platform's projects, suppliers and progress to it. */
export async function runConnection(input: { tenantId: string; connectionId: string; direction: SyncDirection; userId?: number; trigger: "manual" | "scheduled"; fetchImpl?: typeof fetch }): Promise<ConnectionRunResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const connection = await connectionOf(db, input.tenantId, input.connectionId);
  if (!connection.active) throw refuse("BAD_REQUEST", "PROJECT_OS_CONNECTION_INACTIVE");
  const vendor = isVendor(connection.system);
  if (vendor && input.direction === "out") throw refuse("BAD_REQUEST", "PROJECT_OS_CONNECTION_PUSH_UNSUPPORTED");
  const client = vendor ? null : odooFor(connection, input.fetchImpl);
  const settings = settingsOf(connection);
  const result: ConnectionRunResult = { pulled: [], skipped: [], pushed: null };
  const actor = { tenantId: input.tenantId, userId: input.userId ?? connection.createdByUserId };
  const system = connection.system;
  if (input.direction === "in" || input.direction === "both") {
    const since = input.trigger === "scheduled" && settings.sinceDays ? new Date(Date.now() - settings.sinceDays * 86_400_000) : undefined;
    const pulled = vendor ? await vendorFor(connection, input.fetchImpl).pull(since) : await pullFromOdoo(client!, settings, since);
    result.skipped = pulled.skipped;
    // suppliers first: a purchase order names its supplier
    for (const entity of connectorRegistry[system].pulls) {
      const records = pulled.records[entity as keyof typeof pulled.records] ?? [];
      if (!records.length) continue;
      const batch = await applyErpBatch({ actor, system, entity, records, trigger: input.trigger });
      result.pulled.push({ entity, runId: batch.runId, status: batch.status, received: batch.received, accepted: batch.accepted, rejected: batch.rejected });
    }
  }
  if (!vendor && (input.direction === "out" || input.direction === "both")) result.pushed = await pushConnection(db, connection, client!, input.userId);
  await db.update(integrationConnections).set({ lastRunAt: new Date() }).where(eq(integrationConnections.id, connection.id));
  return result;
}

async function pushConnection(db: Db, connection: Connection, client: OdooClient, userId?: number) {
  const tenantId = connection.tenantId;
  const kind = (value: "project" | "supplier" | "progress") => `${connection.system}_out_${value}`;
  const memory: PushMemory = {
    get: async (what, ourId) => {
      const [row] = await db.select({ code: integrationMappings.internalCode, hash: integrationMappings.payloadHash }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, tenantId), eq(integrationMappings.system, connection.system), eq(integrationMappings.entityType, kind(what)), eq(integrationMappings.externalId, ourId))).limit(1);
      return row?.code && row.hash ? { odooId: Number(row.code), hash: row.hash } : null;
    },
    set: async (what, ourId, odooId, hash) => {
      await db.insert(integrationMappings).values({ id: crypto.randomUUID(), tenantId, system: connection.system, entityType: kind(what), externalId: ourId, internalId: ourId, internalCode: String(odooId), payloadHash: hash, lastSyncedAt: new Date() })
        .onConflictDoUpdate({ target: [integrationMappings.tenantId, integrationMappings.system, integrationMappings.entityType, integrationMappings.externalId], set: { internalCode: String(odooId), payloadHash: hash, lastSyncedAt: new Date(), updatedAt: new Date() } });
    },
  };
  const projectRows = await db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.status, "active")));
  const allSuppliers = await db.select({ id: suppliers.id, code: suppliers.code, legalName: suppliers.legalName, contactEmail: suppliers.contactEmail, contactPhone: suppliers.contactPhone, active: suppliers.active }).from(suppliers).where(eq(suppliers.tenantId, tenantId));
  // A supplier that came FROM this system is Odoo's own record: it is not written back (that would overwrite what Odoo's users edited there).
  const cameFromThere = new Set((await db.select({ internalId: integrationMappings.internalId }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, tenantId), eq(integrationMappings.system, connection.system), eq(integrationMappings.entityType, "supplier")))).map(row => row.internalId));
  const supplierRows = allSuppliers.filter(row => !cameFromThere.has(row.id));
  const progress: Array<{ projectId: string; code: string; percent: number }> = [];
  for (const project of projectRows) {
    try {
      const evm = liveEvm(await loadProfitabilityRows(db, { tenantId, projectId: project.id }), new Date(), DEFAULT_EAC_METHOD);
      if (!("error" in evm) && evm.bac > 0) progress.push({ projectId: project.id, code: project.code, percent: (evm.ev / evm.bac) * 100 });
    } catch { /* a project whose earned value cannot be computed sends no progress */ }
  }
  const runId = await startSyncRun(db, { tenantId, system: connection.system, direction: "out", trigger: userId ? "manual" : "scheduled", entityType: "push", startedByUserId: userId });
  const outcomes = await pushToOdoo(client, { projects: projectRows, suppliers: supplierRows, progress }, memory, stableHash);
  const items: SyncItem[] = outcomes.map(outcome => ({ entityType: outcome.kind, externalId: outcome.odooId ? String(outcome.odooId) : outcome.ourId, outcome: outcome.outcome === "rejected" ? "rejected" : outcome.outcome, reason: outcome.reason }));
  await recordSyncItems(db, tenantId, runId, items);
  await finishSyncRun(db, runId, items);
  const count = (what: string) => outcomes.filter(outcome => outcome.outcome === what).length;
  return { runId, created: count("created"), updated: count("updated"), unchanged: count("unchanged"), rejected: count("rejected") };
}

export async function runConnectionForManager(input: { userId: number; tenantId: string; connectionId: string; direction: SyncDirection }) {
  await assertTenantManager(input.userId, input.tenantId);
  return runConnection({ ...input, trigger: "manual" });
}

/** The daily job: every active connection set to run daily, one after another; one failing does not stop the others. */
export async function runScheduledConnections(): Promise<{ ran: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return withSystemContext("scheduled integration pulls", async () => {
    const due = await db.select({ id: integrationConnections.id, tenantId: integrationConnections.tenantId }).from(integrationConnections).where(and(eq(integrationConnections.active, true), eq(integrationConnections.scheduledDaily, true)));
    let ran = 0; let failed = 0;
    for (const connection of due) {
      try { await runConnection({ tenantId: connection.tenantId, connectionId: connection.id, direction: "both", trigger: "scheduled" }); ran += 1; }
      catch (error) { failed += 1; logError("integration.scheduled_connection_failed", error, { connectionId: connection.id }); }
    }
    return { ran, failed };
  });
}
