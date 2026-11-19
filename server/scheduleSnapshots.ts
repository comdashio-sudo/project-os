// Q-23 (live schedule, first batch): every confirmed P6 import and every confirmed activity update leaves a SNAPSHOT of the project's activities as they
// stood once it was written — inside the same transaction, so a snapshot exists exactly when the import does. The first snapshot of a project is its
// BASELINE (one per project, by a partial unique index); later ones are updates. The live schedule compares today's activities with the baseline:
//  - start / finish variance in days (forecast = actual when there is one, else the current planned date; positive = later than the baseline);
//  - critical = P6 total float ≤ 0 on an activity not complete; an activity with no float is «not available», never «not critical»;
//  - planned against actual at the data date: how many the baseline said would have started / finished by then, and how many did;
//  - a two-week look-ahead from the data date: what is not complete and planned to start or finish in it.
// The data date is the P6 file's own (PROJECT.last_recalc_date) when the file carries one, else the moment of the save — and it says which.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { activities, dataImportRowResults, dataImports, scheduleSnapshotActivities, scheduleSnapshots } from "../drizzle/schema";
import { bulkUpdate } from "./bulkUpdate";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";

type Writer = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "execute" | "select" | "insert">;
export type SnapshotSource = "p6_import" | "p6_update" | "p6_update_before" | "p6_rollback";
export const LOOK_AHEAD_DAYS = 14;
const DAY = 86_400_000;

/** P6 writes the data date without a time zone (the schedule's own clock); it is read as UTC, the way the rest of the import reads P6 dates. */
export function p6DataDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}${value.length <= 10 ? "T00:00:00" : ""}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Writes the snapshot of the project's activities as they stand now in this transaction. The first one of the project becomes its baseline. */
export async function captureScheduleSnapshot(tx: Writer, input: { tenantId: string; projectId: string; importId: string; source: SnapshotSource; dataDate: Date | null; userId: number }) {
  // two imports of the same project confirmed at once: the second waits here, then sees the first one's baseline
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`schedule-snapshot:${input.projectId}`}))`);
  const [baseline] = await tx.select({ id: scheduleSnapshots.id }).from(scheduleSnapshots)
    .where(and(eq(scheduleSnapshots.tenantId, input.tenantId), eq(scheduleSnapshots.projectId, input.projectId), eq(scheduleSnapshots.isBaseline, true))).limit(1);
  const id = randomUUID();
  const dataDate = input.dataDate ?? new Date();
  // created_at by the clock, not the transaction start: an update writes two snapshots (before and after) in one transaction, and their order must hold
  await tx.insert(scheduleSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, importId: input.importId, source: input.source, dataDate, isBaseline: !baseline, activityCount: 0, createdByUserId: input.userId, createdAt: sql`clock_timestamp()` });
  await tx.execute(sql`
    INSERT INTO schedule_snapshot_activities (id, tenant_id, project_id, snapshot_id, activity_id, code, planned_start_at, planned_finish_at, actual_start_at, actual_finish_at, total_float_hours, percent_complete, remaining_hours, status)
    SELECT gen_random_uuid(), a.tenant_id, a.project_id, ${id}, a.id, a.code, a.planned_start_at, a.planned_finish_at, a.actual_start_at, a.actual_finish_at, a.total_float_hours, a.percent_complete, a.remaining_hours, a.status::text
    FROM activities a WHERE a.tenant_id = ${input.tenantId} AND a.project_id = ${input.projectId}`);
  await tx.execute(sql`UPDATE schedule_snapshots SET activity_count = (SELECT count(*) FROM schedule_snapshot_activities WHERE snapshot_id = ${id} AND tenant_id = ${input.tenantId}), updated_at = now() WHERE id = ${id} AND tenant_id = ${input.tenantId}`);
  return { snapshotId: id, isBaseline: !baseline, dataDate, dataDateFromFile: Boolean(input.dataDate) };
}

// calendar days (UTC dates), not elapsed hours: P6 plans a finish at 17:00 and an update file gives the date alone — two days late reads 2, not 1.3 → 1
const dayOf = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const days = (later: Date | null, earlier: Date | null) => (later && earlier ? Math.round((dayOf(later) - dayOf(earlier)) / DAY) : null);
const num = (value: string | number | null) => (value === null || value === undefined ? null : Number(value));

export type LiveActivity = {
  id: string; code: string; name: string; status: string; percentComplete: number | null; totalFloatHours: number | null;
  baselineStart: Date | null; baselineFinish: Date | null; forecastStart: Date | null; forecastFinish: Date | null; actualStart: Date | null; actualFinish: Date | null;
  startVarianceDays: number | null; finishVarianceDays: number | null; critical: boolean | null; inBaseline: boolean;
};

/** The live schedule of one project, read with «project.read» on that project. */
export async function getLiveSchedule(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: ["project.read", "project.manage"], scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

  const snapshots = await db.select({ id: scheduleSnapshots.id, source: scheduleSnapshots.source, dataDate: scheduleSnapshots.dataDate, isBaseline: scheduleSnapshots.isBaseline, activityCount: scheduleSnapshots.activityCount, createdAt: scheduleSnapshots.createdAt })
    .from(scheduleSnapshots).where(and(mine(scheduleSnapshots), ne(scheduleSnapshots.source, "p6_update_before"))).orderBy(desc(scheduleSnapshots.createdAt)).limit(50);
  // the baseline read on its own: it may be a «before» snapshot (the hand-made schedule an update first changed), which the list leaves out
  const [baseline = null] = await db.select({ id: scheduleSnapshots.id, source: scheduleSnapshots.source, dataDate: scheduleSnapshots.dataDate, isBaseline: scheduleSnapshots.isBaseline, activityCount: scheduleSnapshots.activityCount, createdAt: scheduleSnapshots.createdAt })
    .from(scheduleSnapshots).where(and(mine(scheduleSnapshots), eq(scheduleSnapshots.isBaseline, true))).limit(1);
  const latest = snapshots[0] ?? null;
  const dataDate = latest?.dataDate ?? new Date();

  const current = await db.select({ id: activities.id, code: activities.code, name: activities.name, status: activities.status, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt, actualStartAt: activities.actualStartAt, actualFinishAt: activities.actualFinishAt, totalFloatHours: activities.totalFloatHours, percentComplete: activities.percentComplete })
    .from(activities).where(mine(activities)).orderBy(asc(activities.plannedStartAt), asc(activities.code));
  const base = baseline
    ? new Map((await db.select({ activityId: scheduleSnapshotActivities.activityId, plannedStartAt: scheduleSnapshotActivities.plannedStartAt, plannedFinishAt: scheduleSnapshotActivities.plannedFinishAt })
        .from(scheduleSnapshotActivities).where(and(mine(scheduleSnapshotActivities), eq(scheduleSnapshotActivities.snapshotId, baseline.id)))).map(row => [row.activityId, row]))
    : new Map<string, { plannedStartAt: Date | null; plannedFinishAt: Date | null }>();

  const rows: LiveActivity[] = current.map(activity => {
    const was = base.get(activity.id);
    const forecastStart = activity.actualStartAt ?? activity.plannedStartAt;
    const forecastFinish = activity.actualFinishAt ?? activity.plannedFinishAt;
    const float = num(activity.totalFloatHours);
    const complete = activity.status === "completed" || Boolean(activity.actualFinishAt);
    return {
      id: activity.id, code: activity.code, name: activity.name, status: activity.status, percentComplete: num(activity.percentComplete), totalFloatHours: float,
      baselineStart: was?.plannedStartAt ?? null, baselineFinish: was?.plannedFinishAt ?? null, forecastStart, forecastFinish, actualStart: activity.actualStartAt, actualFinish: activity.actualFinishAt,
      startVarianceDays: days(forecastStart, was?.plannedStartAt ?? null), finishVarianceDays: days(forecastFinish, was?.plannedFinishAt ?? null),
      critical: complete ? false : float === null ? null : float <= 0, inBaseline: Boolean(was),
    };
  });

  const at = dataDate.getTime();
  const horizon = at + LOOK_AHEAD_DAYS * DAY;
  const within = (date: Date | null) => Boolean(date) && date!.getTime() >= at && date!.getTime() <= horizon;
  const lookAhead = rows.filter(row => !row.actualFinish && row.status !== "completed" && ((!row.actualStart && within(row.forecastStart)) || within(row.forecastFinish))).map(row => row.id);
  const knownFloat = rows.some(row => row.totalFloatHours !== null);
  const summary = {
    activities: rows.length,
    critical: knownFloat ? rows.filter(row => row.critical === true).length : null,
    plannedToStart: baseline ? rows.filter(row => row.baselineStart && row.baselineStart.getTime() <= at).length : null,
    started: rows.filter(row => row.actualStart && row.actualStart.getTime() <= at).length,
    plannedToFinish: baseline ? rows.filter(row => row.baselineFinish && row.baselineFinish.getTime() <= at).length : null,
    finished: rows.filter(row => row.actualFinish && row.actualFinish.getTime() <= at).length,
    lateFinishing: baseline ? rows.filter(row => (row.finishVarianceDays ?? 0) > 0).length : null,
    lookAhead: lookAhead.length,
  };
  return { dataDate, lookAheadDays: LOOK_AHEAD_DAYS, baseline, latest, snapshots, summary, rows, lookAhead };
}

// ------------------------------------------------------------------------------------------------------------- G-208: undo an activity update
/**
 * Puts back what one confirmed activity update (p6update) changed: for each activity it wrote, the actual start and finish, status, percent complete and
 * remaining hours become what its «before» snapshot holds. Refused — and nothing written — when:
 *   the update is not the project's latest snapshot (a later import or update was built on it: undo that first),
 *   it has no «before» snapshot (confirmed before Q-23: there is nothing exact to put back),
 *   any activity it wrote was changed since (named by code: someone worked on top of it).
 * Never a delete: the activities are updated back, the undo leaves a «p6_rollback» snapshot, and the caller marks the import cancelled with its audit row.
 */
export async function rollbackScheduleUpdate(tx: Writer, input: { tenantId: string; projectId: string; importId: string; userId: number }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`schedule-snapshot:${input.projectId}`}))`);
  const scope = and(eq(scheduleSnapshots.tenantId, input.tenantId), eq(scheduleSnapshots.projectId, input.projectId));
  // «latest» among the imports and updates that still stand: an undone one (cancelled) and the undo's own snapshot do not count, so updates are undone newest first
  const [latest] = await tx.select({ id: scheduleSnapshots.id }).from(scheduleSnapshots)
    .innerJoin(dataImports, and(eq(dataImports.id, scheduleSnapshots.importId), eq(dataImports.tenantId, scheduleSnapshots.tenantId)))
    .where(and(scope, inArray(scheduleSnapshots.source, ["p6_import", "p6_update"]), eq(dataImports.status, "completed"))).orderBy(desc(scheduleSnapshots.createdAt)).limit(1);
  const mineOf = await tx.select({ id: scheduleSnapshots.id, source: scheduleSnapshots.source }).from(scheduleSnapshots).where(and(scope, eq(scheduleSnapshots.importId, input.importId)));
  const after = mineOf.find(row => row.source === "p6_update"); const before = mineOf.find(row => row.source === "p6_update_before");
  if (!after || !before) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SCHEDULE_ROLLBACK_NO_SNAPSHOT" });
  if (!latest || latest.id !== after.id) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_SCHEDULE_ROLLBACK_NOT_LATEST" });
  // the row results have no tenant column of their own: they are read through their import, of this company and project (review of #403, CLAUDE.md §4)
  const ids = (await tx.select({ id: dataImportRowResults.entityId }).from(dataImportRowResults)
    .innerJoin(dataImports, and(eq(dataImports.id, dataImportRowResults.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId)))
    .where(and(eq(dataImportRowResults.importId, input.importId), eq(dataImportRowResults.action, "updated"))))
    .map(row => row.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return { restored: 0 };
  const fields = { actualStartAt: scheduleSnapshotActivities.actualStartAt, actualFinishAt: scheduleSnapshotActivities.actualFinishAt, status: scheduleSnapshotActivities.status, percentComplete: scheduleSnapshotActivities.percentComplete, remainingHours: scheduleSnapshotActivities.remainingHours };
  const read = async (snapshotId: string) => new Map((await tx.select({ activityId: scheduleSnapshotActivities.activityId, ...fields }).from(scheduleSnapshotActivities)
    .where(and(eq(scheduleSnapshotActivities.tenantId, input.tenantId), eq(scheduleSnapshotActivities.projectId, input.projectId), eq(scheduleSnapshotActivities.snapshotId, snapshotId), inArray(scheduleSnapshotActivities.activityId, ids)))).map(row => [row.activityId, row]));
  const wrote = await read(after.id); const was = await read(before.id);
  const now = await tx.select({ id: activities.id, code: activities.code, actualStartAt: activities.actualStartAt, actualFinishAt: activities.actualFinishAt, status: activities.status, percentComplete: activities.percentComplete, remainingHours: activities.remainingHours })
    .from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId), inArray(activities.id, ids))).for("update");
  const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const sameNumber = (a: string | null, b: string | null) => (a === null ? null : Number(a)) === (b === null ? null : Number(b));
  const changed = now.filter(row => { const w = wrote.get(row.id); return !w || !same(row.actualStartAt, w.actualStartAt) || !same(row.actualFinishAt, w.actualFinishAt) || row.status !== w.status || !sameNumber(row.percentComplete, w.percentComplete) || !sameNumber(row.remainingHours, w.remainingHours); });
  if (changed.length || now.length !== ids.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_SCHEDULE_ROLLBACK_CHANGED_SINCE", cause: changed.map(row => row.code).slice(0, 20) });
  const restored = await bulkUpdate(tx as unknown as Parameters<typeof bulkUpdate>[0], {
    table: activities, scope: { tenantId: input.tenantId, projectId: input.projectId },
    columns: { actualStartAt: activities.actualStartAt, actualFinishAt: activities.actualFinishAt, status: activities.status, percentComplete: activities.percentComplete, remainingHours: activities.remainingHours, updatedAt: activities.updatedAt },
    rows: ids.map(id => { const b = was.get(id)!; return { id, values: { actualStartAt: b.actualStartAt, actualFinishAt: b.actualFinishAt, status: b.status, percentComplete: b.percentComplete, remainingHours: b.remainingHours, updatedAt: new Date() } }; }),
  });
  await captureScheduleSnapshot(tx, { tenantId: input.tenantId, projectId: input.projectId, importId: input.importId, source: "p6_rollback", dataDate: null, userId: input.userId });
  return { restored };
}

// ------------------------------------------------------------------------------------------------------------- compare two snapshots
type SnapshotRow = { activityId: string; code: string; plannedStartAt: Date | null; plannedFinishAt: Date | null; actualStartAt: Date | null; actualFinishAt: Date | null; totalFloatHours: string | null; status: string };
export type ActivityChange = {
  activityId: string; code: string; kinds: Array<"added" | "removed" | "started" | "finished" | "finish_moved" | "start_moved" | "became_critical" | "no_longer_critical" | "status">;
  from: { status: string | null; plannedFinish: Date | null; actualStart: Date | null; actualFinish: Date | null; totalFloatHours: number | null } | null;
  to: { status: string | null; plannedFinish: Date | null; actualStart: Date | null; actualFinish: Date | null; totalFloatHours: number | null } | null;
  finishMovedDays: number | null;
};

/**
 * Q-23: what changed between two snapshots of ONE project (an earlier «from» and a later «to»), activity by activity: added or removed, started, finished,
 * the forecast finish moved (in calendar days; positive = later), the start moved, became or stopped being critical (P6 float ≤ 0, not complete), or the
 * status changed otherwise. Read with «project.read» on that project; a snapshot of another project or company is not found.
 */
export async function compareScheduleSnapshots(input: { userId: number; tenantId: string; projectId: string; fromSnapshotId: string; toSnapshotId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: ["project.read", "project.manage"], scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const mine = and(eq(scheduleSnapshots.tenantId, input.tenantId), eq(scheduleSnapshots.projectId, input.projectId));
  const pair = await db.select({ id: scheduleSnapshots.id, source: scheduleSnapshots.source, dataDate: scheduleSnapshots.dataDate, createdAt: scheduleSnapshots.createdAt }).from(scheduleSnapshots)
    .where(and(mine, inArray(scheduleSnapshots.id, [input.fromSnapshotId, input.toSnapshotId])));
  const from = pair.find(row => row.id === input.fromSnapshotId); const to = pair.find(row => row.id === input.toSnapshotId);
  if (!from || !to) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_SCHEDULE_SNAPSHOT_NOT_FOUND" });
  const read = async (snapshotId: string) => new Map((await db.select({ activityId: scheduleSnapshotActivities.activityId, code: scheduleSnapshotActivities.code, plannedStartAt: scheduleSnapshotActivities.plannedStartAt, plannedFinishAt: scheduleSnapshotActivities.plannedFinishAt, actualStartAt: scheduleSnapshotActivities.actualStartAt, actualFinishAt: scheduleSnapshotActivities.actualFinishAt, totalFloatHours: scheduleSnapshotActivities.totalFloatHours, status: scheduleSnapshotActivities.status })
    .from(scheduleSnapshotActivities).where(and(eq(scheduleSnapshotActivities.tenantId, input.tenantId), eq(scheduleSnapshotActivities.projectId, input.projectId), eq(scheduleSnapshotActivities.snapshotId, snapshotId)))).map(row => [row.activityId, row as SnapshotRow]));
  const before = await read(from.id); const after = await read(to.id);
  const forecastFinish = (row: SnapshotRow) => row.actualFinishAt ?? row.plannedFinishAt;
  const forecastStart = (row: SnapshotRow) => row.actualStartAt ?? row.plannedStartAt;
  const complete = (row: SnapshotRow) => row.status === "completed" || Boolean(row.actualFinishAt);
  const critical = (row: SnapshotRow) => !complete(row) && row.totalFloatHours !== null && Number(row.totalFloatHours) <= 0;
  const view = (row: SnapshotRow | undefined) => (row ? { status: row.status, plannedFinish: row.plannedFinishAt, actualStart: row.actualStartAt, actualFinish: row.actualFinishAt, totalFloatHours: num(row.totalFloatHours) } : null);
  const changes: ActivityChange[] = [];
  for (const id of Array.from(new Set(Array.from(before.keys()).concat(Array.from(after.keys()))))) {
    const a = before.get(id); const b = after.get(id);
    const kinds: ActivityChange["kinds"] = [];
    if (!a) kinds.push("added"); else if (!b) kinds.push("removed");
    else {
      if (!a.actualStartAt && b.actualStartAt) kinds.push("started");
      if (!a.actualFinishAt && b.actualFinishAt) kinds.push("finished");
      if ((days(forecastFinish(b), forecastFinish(a)) ?? 0) !== 0) kinds.push("finish_moved");
      if (!b.actualStartAt && (days(forecastStart(b), forecastStart(a)) ?? 0) !== 0) kinds.push("start_moved");
      if (!critical(a) && critical(b)) kinds.push("became_critical");
      if (critical(a) && !critical(b) && !complete(b)) kinds.push("no_longer_critical");
      if (a.status !== b.status && !kinds.includes("started") && !kinds.includes("finished")) kinds.push("status");
    }
    if (kinds.length) changes.push({ activityId: id, code: (b ?? a)!.code, kinds, from: view(a), to: view(b), finishMovedDays: a && b ? days(forecastFinish(b), forecastFinish(a)) : null });
  }
  changes.sort((x, y) => x.code.localeCompare(y.code));
  const count = (kind: ActivityChange["kinds"][number]) => changes.filter(change => change.kinds.includes(kind)).length;
  return {
    from, to,
    summary: { changed: changes.length, added: count("added"), removed: count("removed"), started: count("started"), finished: count("finished"), finishLater: changes.filter(change => (change.finishMovedDays ?? 0) > 0).length, finishEarlier: changes.filter(change => (change.finishMovedDays ?? 0) < 0).length, becameCritical: count("became_critical"), noLongerCritical: count("no_longer_critical") },
    changes,
  };
}
