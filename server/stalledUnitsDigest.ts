// Q-14 (b): the 7:00 (Riyadh) stalled-units digest. Once a day, for each active project that has stalled villas, each person who plans it (project.pmc.manage),
// manages it (project.manage) or updates it on site (project.pmc.update) gets ONE in-app notice and, when e-mail is switched on, ONE mail for that project:
// the villas that crossed the threshold today, then those still stalled. Nothing stalled: nothing is written. Running twice the same day adds nothing (the
// notice is looked up by project and day, the mail by its dedupe key). The mail rides the existing outbox as a daily digest, so whoever switched off the
// daily summary does not receive it either. Runs under the scheduler's system context (app.ts), every query filtered by the company being processed.
import { randomUUID } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { internalNotifications, pmcUnits, projects } from "../drizzle/schema";
import { activeTenantIds, enqueueEmail, linkTo, mailerFromEnv, permissionHolders, projectsReachedBy, recipientsWhoWant, type ProjectRow } from "./emailNotifications";
import { dailyMailWindow, stalledUnitsEmail, type StalledDigestVilla } from "./domain/emailNotifications";
import { computeStalledUnits } from "./stalledUnits";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const STALLED_NOTICE_CODE = "STALLED_UNITS_DAILY";
const RECIPIENT_PERMISSIONS = ["project.pmc.manage", "project.manage", "project.pmc.update"] as const;

export async function enqueueStalledUnitDigests(db: Db, now: Date, options: { mail?: boolean } = {}) {
  const window = dailyMailWindow(now);
  const result = { notices: 0, mails: 0 };
  if (!window.open) return result;
  const mail = options.mail ?? Boolean(mailerFromEnv());
  for (const tenantId of await activeTenantIds(db)) {
    const all: ProjectRow[] = await db.select({ id: projects.id, code: projects.code, name: projects.name, portfolioId: projects.portfolioId, programId: projects.programId }).from(projects).where(and(eq(projects.tenantId, tenantId), notInArray(projects.status, ["cancelled", "closed"])));
    const withUnits = new Set((await db.select({ projectId: pmcUnits.projectId }).from(pmcUnits).where(eq(pmcUnits.tenantId, tenantId)).groupBy(pmcUnits.projectId)).map(row => row.projectId));
    const holders = await permissionHolders(db, tenantId, RECIPIENT_PERMISSIONS);
    if (!holders.length) continue;
    const wanting = new Set(await recipientsWhoWant(db, tenantId, "daily_digest", holders.map(holder => holder.userId)));
    for (const project of all.filter(item => withUnits.has(item.id))) {
      const stalled = await computeStalledUnits(db, { tenantId, projectId: project.id }, now);
      const villa = (row: (typeof stalled.rows)[number]): StalledDigestVilla => ({ villa: row.villa, blockCode: row.blockCode, workingDays: row.workingDays, lastActivity: row.lastActivity?.name ?? null });
      const stalledRows = stalled.rows.filter(row => row.state !== "active");
      if (!stalledRows.length) continue;
      const newToday = stalledRows.filter(row => row.state === "stalled" && row.workingDays === stalled.threshold + 1).map(villa);
      const continuing = stalledRows.filter(row => !(row.state === "stalled" && row.workingDays === stalled.threshold + 1)).map(villa);
      const link = linkTo(`/projects/${tenantId}/${project.id}/stalled`);
      const built = stalledUnitsEmail({ date: window.day, projectCode: project.code, projectName: project.name, threshold: stalled.threshold, newToday, continuing, link });
      for (const holder of holders.filter(item => projectsReachedBy(item, all).has(project.id))) {
        const [seen] = await db.select({ id: internalNotifications.id }).from(internalNotifications).where(and(eq(internalNotifications.tenantId, tenantId), eq(internalNotifications.recipientUserId, holder.userId), eq(internalNotifications.projectId, project.id), eq(internalNotifications.notificationCode, STALLED_NOTICE_CODE), sql`${internalNotifications.payload}::jsonb ->> 'day' = ${window.day}`)).limit(1);
        if (!seen) {
          await db.insert(internalNotifications).values({ id: randomUUID(), tenantId, recipientUserId: holder.userId, projectId: project.id, notificationCode: STALLED_NOTICE_CODE, entityType: "project", entityId: project.id, payload: JSON.stringify({ day: window.day, newToday: newToday.length, continuing: continuing.length }) });
          result.notices += 1;
        }
        if (mail && built && wanting.has(holder.userId) && (await enqueueEmail(db, { tenantId, recipientUserId: holder.userId, kind: "daily_digest", dedupeKey: `stalled:${project.id}:${window.day}`, mail: built }))) result.mails += 1;
      }
    }
  }
  return result;
}
