// Outbound webhooks (work order 12, item 9). A company registers an address; when something it asked about happens, the platform POSTs a JSON event signed with the
// endpoint's secret: header `X-ProjectOS-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, so the receiver can check who sent it and that it is fresh.
// A delivery that fails is retried later (the daily job and after-response work) with growing gaps and gives up after six tries; the log shows each try.
// Addresses must be https and must not point inside a network (loopback, private, link-local, the cloud metadata address), checked when the endpoint is saved and again at each delivery.
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { auditLogs, webhookDeliveries, webhookEndpoints } from "../../drizzle/schema";
import { runAfterResponse } from "../_core/afterResponse";
import { withSystemContext } from "../_core/database";
import { assertTenantManager, getDb } from "../db";
import { openSecret, sealSecret } from "./secretBox";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Reader = Pick<Db, "insert" | "select">;
export const WEBHOOK_EVENTS = ["daily_report.approved", "submittal.replied", "material.issued", "sync.completed", "webhook.test"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
const RETRY_GAPS_MINUTES = [1, 5, 30, 120, 720];
const MAX_ATTEMPTS = RETRY_GAPS_MINUTES.length + 1;
const TIMEOUT_MS = 10_000;

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND", message: string) => new TRPCError({ code, message });
/** Loopback is allowed only where an operator opts in (the tests, a local receiver): INTEGRATION_ALLOW_PRIVATE_WEBHOOKS=1. */
const privateAllowed = () => process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS === "1";

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
}

export async function assertSafeWebhookUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw refuse("BAD_REQUEST", "PROJECT_OS_WEBHOOK_URL_INVALID"); }
  if (url.username || url.password) throw refuse("BAD_REQUEST", "PROJECT_OS_WEBHOOK_URL_INVALID");
  if (url.protocol !== "https:" && !(privateAllowed() && url.protocol === "http:")) throw refuse("BAD_REQUEST", "PROJECT_OS_WEBHOOK_URL_NOT_HTTPS");
  if (privateAllowed()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(entry => entry.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw refuse("BAD_REQUEST", "PROJECT_OS_WEBHOOK_URL_PRIVATE");
  return url;
}

export async function createWebhookEndpointForManager(input: { userId: number; tenantId: string; url: string; events: string[] }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const events = Array.from(new Set(input.events));
  if (!events.length || events.some(event => event !== "*" && !(WEBHOOK_EVENTS as readonly string[]).includes(event))) throw refuse("BAD_REQUEST", "PROJECT_OS_WEBHOOK_EVENTS_INVALID");
  const url = await assertSafeWebhookUrl(input.url);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(webhookEndpoints).values({ id, tenantId: input.tenantId, url: url.toString(), secretSealed: sealSecret(secret), events: events.join(","), createdByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "integration.webhook_created", entityType: "webhook_endpoint", entityId: id, metadata: JSON.stringify({ host: url.host, events }) });
  });
  return { id, url: url.toString(), events, secret }; // the secret is shown once
}

export async function listWebhookEndpointsForManager(input: { userId: number; tenantId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const endpoints = await db.select({ id: webhookEndpoints.id, url: webhookEndpoints.url, events: webhookEndpoints.events, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt }).from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, input.tenantId)).orderBy(desc(webhookEndpoints.createdAt));
  const recent = await db.select({ endpointId: webhookDeliveries.endpointId, status: webhookDeliveries.status, total: sql<number>`count(*)::int` }).from(webhookDeliveries).where(eq(webhookDeliveries.tenantId, input.tenantId)).groupBy(webhookDeliveries.endpointId, webhookDeliveries.status);
  return endpoints.map(endpoint => ({ ...endpoint, deliveries: Object.fromEntries(recent.filter(row => row.endpointId === endpoint.id).map(row => [row.status, row.total])) as Record<string, number> }));
}

export async function setWebhookEndpointActiveForManager(input: { userId: number; tenantId: string; endpointId: string; active: boolean }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const changed = await db.transaction(async tx => {
    const rows = await tx.update(webhookEndpoints).set({ active: input.active, updatedAt: new Date() }).where(and(eq(webhookEndpoints.id, input.endpointId), eq(webhookEndpoints.tenantId, input.tenantId))).returning({ id: webhookEndpoints.id });
    if (rows.length) await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.active ? "integration.webhook_enabled" : "integration.webhook_disabled", entityType: "webhook_endpoint", entityId: input.endpointId, metadata: "{}" });
    return rows.length > 0;
  });
  if (!changed) throw refuse("NOT_FOUND", "PROJECT_OS_WEBHOOK_NOT_FOUND");
  return { id: input.endpointId, active: input.active };
}

export async function listWebhookDeliveriesForManager(input: { userId: number; tenantId: string; endpointId?: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db.select({ id: webhookDeliveries.id, endpointId: webhookDeliveries.endpointId, eventType: webhookDeliveries.eventType, status: webhookDeliveries.status, attempts: webhookDeliveries.attempts, lastStatusCode: webhookDeliveries.lastStatusCode, lastError: webhookDeliveries.lastError, deliveredAt: webhookDeliveries.deliveredAt, createdAt: webhookDeliveries.createdAt })
    .from(webhookDeliveries).where(and(eq(webhookDeliveries.tenantId, input.tenantId), input.endpointId ? eq(webhookDeliveries.endpointId, input.endpointId) : undefined)).orderBy(desc(webhookDeliveries.createdAt)).limit(200);
}

/** Queues an event for every active endpoint that asked for it. Called inside the transaction of whatever happened, so a rolled-back act sends nothing. */
export async function emitWebhookEvent(handle: Reader, tenantId: string, eventType: WebhookEvent, data: Record<string, unknown>) {
  const endpoints = await handle.select({ id: webhookEndpoints.id, events: webhookEndpoints.events }).from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.active, true)));
  const wanted = endpoints.filter(endpoint => endpoint.events === "*" || endpoint.events.split(",").includes(eventType));
  if (!wanted.length) return 0;
  const body = JSON.stringify({ id: crypto.randomUUID(), type: eventType, createdAt: new Date().toISOString(), tenantId, data });
  await handle.insert(webhookDeliveries).values(wanted.map(endpoint => ({ id: crypto.randomUUID(), tenantId, endpointId: endpoint.id, eventType, payload: body })));
  return wanted.length;
}

export const signWebhook = (secret: string, body: string, timestamp: number) => `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** Delivers what is due. Runs as the system (it crosses companies); every statement still names its row. */
export async function deliverDueWebhooks(options: { now?: Date; limit?: number; fetchImpl?: typeof fetch } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const now = options.now ?? new Date();
  const doFetch = options.fetchImpl ?? fetch;
  return withSystemContext("deliver due webhooks", async () => {
    const due = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now))).orderBy(asc(webhookDeliveries.nextAttemptAt)).limit(options.limit ?? 50);
    let delivered = 0; let retrying = 0; let failed = 0;
    for (const delivery of due) {
      const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
      let statusCode: number | null = null; let error: string | null = null;
      try {
        if (!endpoint || !endpoint.active) throw new Error("ENDPOINT_INACTIVE");
        const url = await assertSafeWebhookUrl(endpoint.url);
        const timestamp = Math.floor(now.getTime() / 1000);
        const response = await doFetch(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "content-type": "application/json", "user-agent": "ProjectOS-Webhooks/1", "x-projectos-event": delivery.eventType, "x-projectos-delivery": delivery.id, "x-projectos-signature": signWebhook(openSecret(endpoint.secretSealed), delivery.payload, timestamp) }, body: delivery.payload });
        statusCode = response.status;
        if (response.status < 200 || response.status >= 300) error = `HTTP_${response.status}`;
      } catch (caught) { error = caught instanceof Error ? caught.message.slice(0, 120) : "DELIVERY_ERROR"; }
      const attempts = delivery.attempts + 1;
      if (!error) { await db.update(webhookDeliveries).set({ status: "delivered", attempts, lastStatusCode: statusCode, lastError: null, deliveredAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id)); delivered += 1; continue; }
      if (attempts >= MAX_ATTEMPTS || error === "ENDPOINT_INACTIVE") { await db.update(webhookDeliveries).set({ status: "failed", attempts, lastStatusCode: statusCode, lastError: error }).where(eq(webhookDeliveries.id, delivery.id)); failed += 1; continue; }
      await db.update(webhookDeliveries).set({ attempts, lastStatusCode: statusCode, lastError: error, nextAttemptAt: new Date(now.getTime() + RETRY_GAPS_MINUTES[attempts - 1] * 60_000) }).where(eq(webhookDeliveries.id, delivery.id));
      retrying += 1;
    }
    return { due: due.length, delivered, retrying, failed };
  });
}

/** A test event to one endpoint, delivered now, so the company sees its receiver answer. */
export async function sendTestWebhookForManager(input: { userId: number; tenantId: string; endpointId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const [endpoint] = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.id, input.endpointId), eq(webhookEndpoints.tenantId, input.tenantId))).limit(1);
  if (!endpoint) throw refuse("NOT_FOUND", "PROJECT_OS_WEBHOOK_NOT_FOUND");
  const id = crypto.randomUUID();
  await db.insert(webhookDeliveries).values({ id, tenantId: input.tenantId, endpointId: endpoint.id, eventType: "webhook.test", payload: JSON.stringify({ id: crypto.randomUUID(), type: "webhook.test", createdAt: new Date().toISOString(), tenantId: input.tenantId, data: { message: "test" } }) });
  await deliverDueWebhooks({ limit: 200 });
  const [after] = await db.select({ status: webhookDeliveries.status, lastStatusCode: webhookDeliveries.lastStatusCode, lastError: webhookDeliveries.lastError }).from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1);
  return { deliveryId: id, ...after };
}


/** After a transaction that queued events has committed: deliver what is due without holding up the answer. */
export const kickWebhookDelivery = () => { void runAfterResponse("webhook delivery", () => deliverDueWebhooks()); };
