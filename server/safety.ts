// Q-28 (P-117): the project's safety register on the server — incidents (near misses to lost-time injuries), permits to work for hazardous work, and the two
// rates LTIFR and TRIR over the man-hours of the approved daily reports.
//  - Reading takes project.read or project.hse.manage on the project; writing takes project.hse.manage (the permission the HSE observations already take),
//    under the PROJECT licence. Every write writes its audit row in the same transaction; every UPDATE returns its row and refuses zero rows.
//  - An incident is never deleted: it moves open → investigating → closed, and closing needs the corrective action. A lost-day count belongs only to a
//    lost-time injury or a fatality (the database checks it too). A date in the future is refused (the site day).
//  - A permit is issued for a window (from < to) and is then closed or cancelled with a note; "expired" is computed (still active past its end).
//  - Man-hours: for each approved daily report, its headcount × its working hours (the report's, else the project's working day); a report with people but
//    no hours is counted in `daysWithoutHours`, never guessed. Counted per report, so two reports of one day are not double-counted.
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, projectProfiles, safetyIncidents, siteDailyReportLabour, siteDailyReports, users, workPermits } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot, isDuplicateEntryError } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { siteToday } from "./wo22Shared";
import { LOST_TIME_KINDS, permitState, safetyRates, type SafetyIncidentKind } from "@shared/safetyIndicators";
import { countedReportCondition } from "./reportCounting";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const READ = ["project.read", "project.hse.manage"] as const;
const WRITE = "project.hse.manage";
const fail = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) => new TRPCError({ code, message });
const oneRow = (rows: { id: string }[], notFound: string) => { if (rows.length !== 1) throw fail("NOT_FOUND", notFound); return rows[0]!; };

async function safetyScope(input: Scope, permission: typeof WRITE | typeof READ): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
const audit = (tx: Parameters<Parameters<Db["transaction"]>[0]>[0], input: Scope, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId, metadata: JSON.stringify({ projectId: input.projectId, ...metadata }) });

/* ---------------- incidents ---------------- */

export type IncidentInput = { incidentNumber: string; occurredOn: string; kind: SafetyIncidentKind; title: string; description: string; location?: string | null; peopleInvolved?: number; lostDays?: number; rootCause?: string | null; correctiveAction?: string | null };

function checkIncident(input: Pick<IncidentInput, "occurredOn" | "kind" | "lostDays">) {
  if (input.occurredOn > siteToday()) throw fail("BAD_REQUEST", "PROJECT_OS_SAFETY_DATE_IN_FUTURE");
  if ((input.lostDays ?? 0) > 0 && !LOST_TIME_KINDS.includes(input.kind)) throw fail("BAD_REQUEST", "PROJECT_OS_SAFETY_LOST_DAYS_INVALID");
}

export async function recordSafetyIncident(input: Scope & IncidentInput) {
  const db = await safetyScope(input, WRITE);
  checkIncident(input);
  const id = crypto.randomUUID();
  try {
    await db.transaction(async tx => {
      await tx.insert(safetyIncidents).values({ id, tenantId: input.tenantId, projectId: input.projectId, incidentNumber: input.incidentNumber, occurredOn: input.occurredOn, kind: input.kind, title: input.title, description: input.description, location: input.location ?? null, peopleInvolved: input.peopleInvolved ?? 0, lostDays: input.lostDays ?? 0, rootCause: input.rootCause ?? null, correctiveAction: input.correctiveAction ?? null, reportedByUserId: input.userId });
      await audit(tx, input, "hse.incident_recorded", "safety_incident", id, { number: input.incidentNumber, kind: input.kind, occurredOn: input.occurredOn, lostDays: input.lostDays ?? 0 });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw fail("CONFLICT", "PROJECT_OS_SAFETY_NUMBER_EXISTS");
    throw error;
  }
  return { id };
}

/** open → investigating → closed (closing needs the corrective action, written now or before); the lost days, root cause and action may be filled in on the way. */
export async function updateSafetyIncident(input: Scope & { incidentId: string; status?: "investigating" | "closed"; lostDays?: number; rootCause?: string | null; correctiveAction?: string | null }) {
  const db = await safetyScope(input, WRITE);
  return db.transaction(async tx => {
    const [row] = await tx.select({ id: safetyIncidents.id, status: safetyIncidents.status, kind: safetyIncidents.kind, occurredOn: safetyIncidents.occurredOn, lostDays: safetyIncidents.lostDays, rootCause: safetyIncidents.rootCause, correctiveAction: safetyIncidents.correctiveAction, incidentNumber: safetyIncidents.incidentNumber })
      .from(safetyIncidents).where(and(eq(safetyIncidents.id, input.incidentId), eq(safetyIncidents.tenantId, input.tenantId), eq(safetyIncidents.projectId, input.projectId))).for("update").limit(1);
    if (!row) throw fail("NOT_FOUND", "PROJECT_OS_SAFETY_INCIDENT_NOT_FOUND");
    if (row.status === "closed") throw fail("CONFLICT", "PROJECT_OS_SAFETY_INCIDENT_CLOSED");
    if (input.status === "investigating" && row.status !== "open") throw fail("CONFLICT", "PROJECT_OS_SAFETY_TRANSITION_INVALID");
    const next = { lostDays: input.lostDays ?? row.lostDays, rootCause: input.rootCause === undefined ? row.rootCause : input.rootCause, correctiveAction: input.correctiveAction === undefined ? row.correctiveAction : input.correctiveAction };
    checkIncident({ occurredOn: row.occurredOn, kind: row.kind, lostDays: next.lostDays });
    if (input.status === "closed" && !next.correctiveAction?.trim()) throw fail("BAD_REQUEST", "PROJECT_OS_SAFETY_CORRECTIVE_ACTION_REQUIRED");
    const status = input.status ?? row.status;
    const now = new Date();
    oneRow(await tx.update(safetyIncidents).set({ ...next, status, closedAt: status === "closed" ? now : null, updatedAt: now })
      .where(and(eq(safetyIncidents.id, row.id), eq(safetyIncidents.tenantId, input.tenantId))).returning({ id: safetyIncidents.id }), "PROJECT_OS_SAFETY_INCIDENT_NOT_FOUND");
    await audit(tx, input, status === "closed" ? "hse.incident_closed" : "hse.incident_updated", "safety_incident", row.id, { number: row.incidentNumber, from: row.status, to: status, lostDays: next.lostDays });
    return { id: row.id, status };
  });
}

/* ---------------- permits to work ---------------- */

export type PermitInput = { permitNumber: string; permitType: "hot_work" | "work_at_height" | "confined_space" | "excavation" | "electrical" | "lifting" | "other"; description: string; location?: string | null; responsibleParty?: string | null; validFrom: Date; validTo: Date };

export async function issueWorkPermit(input: Scope & PermitInput) {
  const db = await safetyScope(input, WRITE);
  if (!(input.validTo.getTime() > input.validFrom.getTime())) throw fail("BAD_REQUEST", "PROJECT_OS_SAFETY_PERMIT_WINDOW_INVALID");
  const id = crypto.randomUUID();
  try {
    await db.transaction(async tx => {
      await tx.insert(workPermits).values({ id, tenantId: input.tenantId, projectId: input.projectId, permitNumber: input.permitNumber, permitType: input.permitType, description: input.description, location: input.location ?? null, responsibleParty: input.responsibleParty ?? null, validFrom: input.validFrom, validTo: input.validTo, issuedByUserId: input.userId });
      await audit(tx, input, "hse.permit_issued", "work_permit", id, { number: input.permitNumber, type: input.permitType, validFrom: input.validFrom.toISOString(), validTo: input.validTo.toISOString() });
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw fail("CONFLICT", "PROJECT_OS_SAFETY_NUMBER_EXISTS");
    throw error;
  }
  return { id };
}

/** An active permit (expired or not) is closed when the work ends, or cancelled; either needs a note, and a closed or cancelled permit stays so. */
export async function closeWorkPermit(input: Scope & { permitId: string; outcome: "closed" | "cancelled"; note: string }) {
  const db = await safetyScope(input, WRITE);
  return db.transaction(async tx => {
    const [row] = await tx.select({ id: workPermits.id, status: workPermits.status, permitNumber: workPermits.permitNumber }).from(workPermits)
      .where(and(eq(workPermits.id, input.permitId), eq(workPermits.tenantId, input.tenantId), eq(workPermits.projectId, input.projectId))).for("update").limit(1);
    if (!row) throw fail("NOT_FOUND", "PROJECT_OS_SAFETY_PERMIT_NOT_FOUND");
    if (row.status !== "active") throw fail("CONFLICT", "PROJECT_OS_SAFETY_PERMIT_CLOSED");
    const now = new Date();
    oneRow(await tx.update(workPermits).set({ status: input.outcome, closedAt: now, closeNote: input.note, updatedAt: now })
      .where(and(eq(workPermits.id, row.id), eq(workPermits.tenantId, input.tenantId))).returning({ id: workPermits.id }), "PROJECT_OS_SAFETY_PERMIT_NOT_FOUND");
    await audit(tx, input, input.outcome === "closed" ? "hse.permit_closed" : "hse.permit_cancelled", "work_permit", row.id, { number: row.permitNumber, note: input.note });
    return { id: row.id, status: input.outcome };
  });
}

/* ---------------- the register and the rates ---------------- */

/** Man-hours of the approved daily reports from `from` to `to` (site days), counted per report. */
export async function approvedManHours(db: Db, input: Scope & { from: string; to: string }) {
  const [profile] = await db.select({ workStart: projectProfiles.workStart, workEnd: projectProfiles.workEnd }).from(projectProfiles)
    .where(and(eq(projectProfiles.tenantId, input.tenantId), eq(projectProfiles.projectId, input.projectId))).limit(1);
  const profileHours = profile?.workStart && profile.workEnd ? (Date.parse(`1970-01-01T${profile.workEnd}Z`) - Date.parse(`1970-01-01T${profile.workStart}Z`)) / 3_600_000 : null;
  const rows = await db.select({ id: siteDailyReports.id, workHours: siteDailyReports.workHours, headcount: sql<number>`coalesce(sum(${siteDailyReportLabour.headcount}), 0)::int` })
    .from(siteDailyReports)
    .leftJoin(siteDailyReportLabour, and(eq(siteDailyReportLabour.reportId, siteDailyReports.id), eq(siteDailyReportLabour.tenantId, siteDailyReports.tenantId)))
    .where(and(eq(siteDailyReports.tenantId, input.tenantId), eq(siteDailyReports.projectId, input.projectId), await countedReportCondition(db, input.tenantId), gte(siteDailyReports.reportDate, input.from), lte(siteDailyReports.reportDate, input.to)))
    .groupBy(siteDailyReports.id, siteDailyReports.workHours);
  let manHours = 0; let daysWithoutHours = 0;
  for (const row of rows) {
    const hours = row.workHours === null ? profileHours : Number(row.workHours);
    if (hours === null || !Number.isFinite(hours)) { if (row.headcount) daysWithoutHours += 1; continue; }
    manHours += row.headcount * hours;
  }
  return { manHours, daysWithoutHours, reports: rows.length };
}

/** The register for a period (default: the project's whole history up to the site day): incidents, permits with their state, and the two rates. */
export async function getSafetyRegister(input: Scope & { from?: string; to?: string }) {
  const db = await safetyScope(input, READ);
  const to = input.to ?? siteToday();
  const from = input.from ?? "1900-01-01";
  if (from > to) throw fail("BAD_REQUEST", "PROJECT_OS_REPORT_PERIOD_INVALID");
  const [incidents, permits, hours] = await Promise.all([
    db.select({ id: safetyIncidents.id, incidentNumber: safetyIncidents.incidentNumber, occurredOn: safetyIncidents.occurredOn, kind: safetyIncidents.kind, title: safetyIncidents.title, description: safetyIncidents.description, location: safetyIncidents.location, peopleInvolved: safetyIncidents.peopleInvolved, lostDays: safetyIncidents.lostDays, rootCause: safetyIncidents.rootCause, correctiveAction: safetyIncidents.correctiveAction, status: safetyIncidents.status, reportedBy: users.name, closedAt: safetyIncidents.closedAt })
      .from(safetyIncidents).leftJoin(users, eq(users.id, safetyIncidents.reportedByUserId))
      .where(and(eq(safetyIncidents.tenantId, input.tenantId), eq(safetyIncidents.projectId, input.projectId), gte(safetyIncidents.occurredOn, from), lte(safetyIncidents.occurredOn, to)))
      .orderBy(desc(safetyIncidents.occurredOn), desc(safetyIncidents.incidentNumber)),
    db.select({ id: workPermits.id, permitNumber: workPermits.permitNumber, permitType: workPermits.permitType, description: workPermits.description, location: workPermits.location, responsibleParty: workPermits.responsibleParty, validFrom: workPermits.validFrom, validTo: workPermits.validTo, status: workPermits.status, closeNote: workPermits.closeNote })
      .from(workPermits).where(and(eq(workPermits.tenantId, input.tenantId), eq(workPermits.projectId, input.projectId))).orderBy(asc(workPermits.validTo)),
    approvedManHours(db, { ...input, from, to }),
  ]);
  const now = new Date();
  return {
    period: { from: input.from ?? null, to },
    incidents,
    permits: permits.map(permit => ({ ...permit, state: permitState(permit, now) })),
    rates: { ...safetyRates({ incidents, manHours: hours.manHours }), daysWithoutHours: hours.daysWithoutHours, reports: hours.reports },
  };
}
