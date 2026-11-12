// D-49 (a): the weekly report's own words. The figures are NEVER stored: the screen reads them from the period engine (reportPeriods.get, D-48) every time,
// so a correction to a daily report shows in the weekly one at once. What is stored is what a person wrote for the week (eleven texts) and the daily-report
// photos chosen for it, by id; a chosen photo must be one of this project's daily-report photos (checked here, and by the composite foreign key of 0034).
//
// Read: the daily report's read permissions. Write: the daily report's write permission (project.field.manage) or project.manage. One report per project and week;
// a save replaces its texts and its photo list whole, in one transaction with its audit row.
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, siteDailyReportPhotos, siteDailyReports, weeklyReportPhotos, weeklyReports } from "../drizzle/schema";
import { periodRange } from "./domain/reportPeriod";
import { authorize, READ_PERMISSIONS } from "./siteReports";
import { storageGetSignedUrl } from "./storage";

type Scope = { userId: number; tenantId: string; projectId: string };
export const WEEKLY_TEXTS = ["summary", "analysis", "correctiveActions", "milestones", "outlook", "engineering", "procurement", "commercial", "interfaces", "issues", "decisions"] as const;
export type WeeklyText = (typeof WEEKLY_TEXTS)[number];
export const WEEKLY_WRITE_PERMISSIONS = ["project.field.manage", "project.manage"] as const;
export const MAX_WEEKLY_PHOTOS = 24;

const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
function weekOf(weekStart: string) {
  const range = periodRange("week", weekStart);
  if (!range) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_REPORT_PERIOD_INVALID" });
  return range;
}

/** The week's saved words and chosen photos (null when nothing was saved), and the photos of the week's daily reports to choose from (a rejected report's are not offered). */
export async function getWeeklyReport(input: Scope & { weekStart: string }) {
  const db = await authorize(input, READ_PERMISSIONS);
  const range = weekOf(input.weekStart);
  const [report] = await db.select().from(weeklyReports).where(and(mine(weeklyReports, input), eq(weeklyReports.weekStart, range.start))).limit(1);
  const photoColumns = { id: siteDailyReportPhotos.id, reportDate: siteDailyReports.reportDate, fileName: siteDailyReportPhotos.fileName, caption: siteDailyReportPhotos.caption, zone: siteDailyReportPhotos.zone, storageKey: siteDailyReportPhotos.storageKey };
  const [chosen, candidates] = await Promise.all([
    report
      ? db.select({ ...photoColumns, sortOrder: weeklyReportPhotos.sortOrder }).from(weeklyReportPhotos)
        .innerJoin(siteDailyReportPhotos, and(eq(siteDailyReportPhotos.id, weeklyReportPhotos.photoId), eq(siteDailyReportPhotos.tenantId, weeklyReportPhotos.tenantId), eq(siteDailyReportPhotos.projectId, weeklyReportPhotos.projectId)))
        .innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportPhotos.reportId))
        .where(and(mine(weeklyReportPhotos, input), eq(weeklyReportPhotos.weeklyReportId, report.id))).orderBy(asc(weeklyReportPhotos.sortOrder))
      : Promise.resolve([]),
    db.select(photoColumns).from(siteDailyReportPhotos).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportPhotos.reportId))
      .where(and(mine(siteDailyReportPhotos, input), mine(siteDailyReports, input), sql`${siteDailyReports.status} <> 'rejected'`, sql`${siteDailyReports.reportDate} >= ${range.start}`, sql`${siteDailyReports.reportDate} <= ${range.end}`))
      .orderBy(asc(siteDailyReports.reportDate), asc(siteDailyReportPhotos.createdAt)).limit(200),
  ]);
  const withUrl = async <T extends { storageKey: string }>(rows: T[]) => Promise.all(rows.map(async ({ storageKey, ...row }) => ({ ...row, url: await storageGetSignedUrl(storageKey).catch(() => null) })));
  return {
    week: { start: range.start, end: range.end },
    report: report ? { id: report.id, ...Object.fromEntries(WEEKLY_TEXTS.map(key => [key, report[key]])) as Record<WeeklyText, string | null>, updatedAt: report.updatedAt, updatedByUserId: report.updatedByUserId } : null,
    photos: await withUrl(chosen.map(({ sortOrder: _sortOrder, ...row }) => row)),
    candidates: await withUrl(candidates),
  };
}

/** Saves the week's texts (an empty or absent text is stored as NULL) and its chosen photos, replacing both whole. Returns the report's id. */
export async function saveWeeklyReport(input: Scope & { weekStart: string; texts: Partial<Record<WeeklyText, string | null>>; photoIds: string[] }) {
  const db = await authorize(input, WEEKLY_WRITE_PERMISSIONS);
  const range = weekOf(input.weekStart);
  const photoIds = Array.from(new Set(input.photoIds));
  if (photoIds.length > MAX_WEEKLY_PHOTOS) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_WEEKLY_REPORT_PHOTOS_TOO_MANY" });
  // a photo of another project or company is refused before anything is written (the composite key would refuse it too, as a raw 23503)
  if (photoIds.length && (await db.select({ id: siteDailyReportPhotos.id }).from(siteDailyReportPhotos).where(and(mine(siteDailyReportPhotos, input), inArray(siteDailyReportPhotos.id, photoIds)))).length !== photoIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_WEEKLY_REPORT_PHOTO_NOT_FOUND" });
  }
  const texts = Object.fromEntries(WEEKLY_TEXTS.map(key => [key, input.texts[key]?.trim() || null])) as Record<WeeklyText, string | null>;
  return db.transaction(async tx => {
    const [existing] = await tx.select({ id: weeklyReports.id }).from(weeklyReports).where(and(mine(weeklyReports, input), eq(weeklyReports.weekStart, range.start))).limit(1);
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      await tx.update(weeklyReports).set({ ...texts, updatedByUserId: input.userId, updatedAt: new Date() }).where(and(mine(weeklyReports, input), eq(weeklyReports.id, id)));
      await tx.delete(weeklyReportPhotos).where(and(mine(weeklyReportPhotos, input), eq(weeklyReportPhotos.weeklyReportId, id)));
    } else {
      // two first saves of the same week at once: the unique index decides, and the loser is told the week has a report (not a 500)
      await tx.insert(weeklyReports).values({ id, tenantId: input.tenantId, projectId: input.projectId, weekStart: range.start, ...texts, createdByUserId: input.userId, updatedByUserId: input.userId })
        .catch(error => { if ((error as { code?: string; cause?: { code?: string } }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_WEEKLY_REPORT_EXISTS" }); throw error; });
    }
    if (photoIds.length) await tx.insert(weeklyReportPhotos).values(photoIds.map((photoId, index) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, weeklyReportId: id, photoId, sortOrder: index })));
    // the audit row says what was saved, not the words themselves: which texts are filled, and how many photos
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: existing ? "weekly_report.updated" : "weekly_report.created", entityType: "weekly_report", entityId: id,
      metadata: JSON.stringify({ projectId: input.projectId, weekStart: range.start, filled: WEEKLY_TEXTS.filter(key => texts[key] !== null), photos: photoIds.length }) });
    return { id, weekStart: range.start };
  });
}
