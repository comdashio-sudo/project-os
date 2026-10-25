// The log of every exchange with another system (work order 12, item 8): a run per call or per scheduled pull, and a line for each record that says what became of it —
// created, updated, unchanged, stored (kept as it arrived, not applied), or rejected with the reason. The company reads this to see what arrived and what did not.
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { integrationSyncItems, integrationSyncRuns } from "../../drizzle/schema";
import { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type SyncOutcome = "created" | "updated" | "unchanged" | "stored" | "rejected";
export type SyncItem = { entityType: string; externalId: string | null; outcome: SyncOutcome; reason?: string; detail?: string };
export type RunStart = { tenantId: string; system: string; direction: "in" | "out"; trigger: "manual" | "scheduled" | "api" | "webhook"; entityType?: string; apiKeyId?: string; startedByUserId?: number };

export const stableHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v))).digest("hex");

export async function startSyncRun(db: Db, input: RunStart) {
  const id = crypto.randomUUID();
  await db.insert(integrationSyncRuns).values({ id, tenantId: input.tenantId, system: input.system, direction: input.direction, trigger: input.trigger, entityType: input.entityType, apiKeyId: input.apiKeyId, startedByUserId: input.startedByUserId });
  return id;
}

export async function recordSyncItems(db: Db, tenantId: string, runId: string, items: readonly SyncItem[]) {
  for (let offset = 0; offset < items.length; offset += 500) {
    await db.insert(integrationSyncItems).values(items.slice(offset, offset + 500).map(item => ({ id: crypto.randomUUID(), tenantId, runId, entityType: item.entityType, externalId: item.externalId, outcome: item.outcome, reason: item.reason?.slice(0, 80), detail: item.detail?.slice(0, 300) })));
  }
}

export async function finishSyncRun(db: Db, runId: string, items: readonly SyncItem[], failure?: string) {
  const rejected = items.filter(item => item.outcome === "rejected").length;
  const accepted = items.length - rejected;
  const status = failure ? "failed" : rejected === 0 ? "ok" : accepted === 0 ? "failed" : "partial";
  // rows=0 is ambiguous (work order 20, item 13): the run row was written a moment ago in this request, so "no row updated" means the run is gone or invisible, and reporting a status for it would be a lie.
  const finished = await db.update(integrationSyncRuns).set({ status, received: items.length, accepted, rejected, finishedAt: new Date(), errorSummary: failure?.slice(0, 300) }).where(eq(integrationSyncRuns.id, runId)).returning({ id: integrationSyncRuns.id });
  if (finished.length !== 1) throw new Error("PROJECT_OS_SYNC_RUN_NOT_FOUND");
  return { runId, status, received: items.length, accepted, rejected };
}

export async function listSyncRuns(db: Db, tenantId: string, limit = 50) {
  return db.select().from(integrationSyncRuns).where(eq(integrationSyncRuns.tenantId, tenantId)).orderBy(desc(integrationSyncRuns.startedAt)).limit(Math.min(limit, 200));
}

export async function listSyncItems(db: Db, tenantId: string, runId: string, outcome?: SyncOutcome) {
  return db.select().from(integrationSyncItems).where(and(eq(integrationSyncItems.tenantId, tenantId), eq(integrationSyncItems.runId, runId), outcome ? eq(integrationSyncItems.outcome, outcome) : undefined)).orderBy(integrationSyncItems.createdAt).limit(2000);
}
