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
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { activities, scheduleSnapshotActivities, scheduleSnapshots } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";

type Writer = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "execute" | "select" | "insert">;
export type SnapshotSource = "p6_import" | "p6_update";
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
  await tx.insert(scheduleSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, importId: input.importId, source: input.source, dataDate, isBaseline: !baseline, activityCount: 0, createdByUserId: input.userId });
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
    .from(scheduleSnapshots).where(mine(scheduleSnapshots)).orderBy(desc(scheduleSnapshots.createdAt)).limit(50);
  const baseline = snapshots.find(row => row.isBaseline) ?? null;
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
