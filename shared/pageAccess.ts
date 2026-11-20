// Q-33 (P0-04): what each project page needs to be read, written once for both sides. A page is shown (its link drawn, its address opened) only when
// EVERY group holds — a group is one server read the page makes on first render, and any one code of the group satisfies it, exactly as that read's
// server check does. server/pageAccess.database.test.ts calls the real reads for each role and fails if a page's gate and its server disagree.
export type PageAccess = readonly (readonly string[])[];

/** Who reads the day's site report (server/siteReports.ts READ_PERMISSIONS reads this list): any one of them. */
export const DAILY_REPORT_READERS = ["project.read", "project.field.manage", "project.manage", "project.pmc.manage", "project.schedule.manage", "project.hse.manage", "project.quality.manage", "project.qc.receive"] as const;

export const PAGE_ACCESS = {
  // projects.list — listProjectsForTenant (server/db.ts)
  registry: [["project.read"]],
  // projects.getControlsSchedule / Financials / Performance — getProjectControlsForTenant
  controls: [["project.read"]],
  // fieldEntry.context — getFieldEntryContextForTenant
  fieldEntry: [["project.read"]],
  // siteReports.options (listFieldOptionsForTenant) + pmc.inspections (listPmcInspectionRequests) + ncrs.list (getNcrsForTenant): the page waits for all three
  quality: [["project.read", "project.field.manage", "project.manage"], ["project.pmc.read"], ["project.read"]],
  // pmc.progressActivities — listProgressActivities
  progress: [["project.pmc.read"]],
  // pmc.qcHistory — listPmcQcHistory
  qc: [["project.pmc.read"]],
  // projects.baseline.status — getBaselineStatus (project.create was in the old gate but the server does not accept it: a planning engineer was shown a page it refused)
  baseline: [["project.read", "project.manage"]],
  team: [["project.manage", "project.team.invite"]],
  pmc: [["project.pmc.read"]],
  stalled: [["project.pmc.read"]],
  // meetings.list — listProjectMeetings (server/meetings.ts), Q-25
  meetings: [["project.read", "project.manage"]],
  // pmo.projectRisks — listProjectRisks (server/projectRisks.ts), Q-27 (P-116)
  risks: [["pmo.read"]],
  // safety.register — getSafetyRegister (server/safety.ts), Q-28 (P-118)
  safety: [["project.read", "project.hse.manage"]],
  // siteReports.list — listSiteDailyReportsForTenant (server/siteReports.ts)
  dailyReport: [DAILY_REPORT_READERS],
  // reportPeriods.weekly / reportPeriods.monthly — getWeeklyReport, getMonthlyReport (server/siteReports.ts READ_PERMISSIONS)
  weeklyReport: [DAILY_REPORT_READERS],
  monthlyReport: [DAILY_REPORT_READERS],
  // pmcSite.percentages — pmcSourcePercentages (server/pmcSiteService.ts)
  siteConsultant: [["project.pmc.read"]],
  // pmcSite.activities — listSiteActivities (server/pmcSiteService.ts); the «site update» screen (review of #419)
  siteUpdate: [["project.pmc.read"]],
  // schedule.live — getLiveSchedule (server/scheduleSnapshots.ts), Q-23
  schedule: [["project.read", "project.manage"]],
  profitability: [["project.read"]],
  commercial: [["project.read"]],
} as const satisfies Record<string, PageAccess>;
export type PageKey = keyof typeof PAGE_ACCESS;

/** The gate itself, for one holder of these permission codes (the scope check is the caller's: see client/src/lib/permissions.tsx useCanPage). */
export const pageAllowed = (page: PageKey, holds: (codes: readonly string[]) => boolean) => PAGE_ACCESS[page].every(group => holds(group));

/**
 * Q-36 (step 2 b, adviser's decision §6.2): «الموقع والتنفيذ» is an entry page that gathers four site pages, each as a card with its count. The entry opens
 * for whoever may open at least one of them, and each card shows only for whoever may open its own page. The side menu's item reads SITE_HUB_READERS.
 */
export const SITE_HUB_PAGES = ["dailyReport", "progress", "qc", "stalled"] as const satisfies readonly PageKey[];
export const SITE_HUB_READERS: readonly string[] = Array.from(new Set(SITE_HUB_PAGES.flatMap(page => PAGE_ACCESS[page].length === 1 ? PAGE_ACCESS[page][0] : [])));

/** Q-36 (step 2 c): «التقارير» — the weekly report, the monthly report and the site ↔ consultant comparison, gathered the same way as the site's page. */
export const REPORTS_HUB_PAGES = ["weeklyReport", "monthlyReport", "siteConsultant"] as const satisfies readonly PageKey[];
export const REPORTS_HUB_READERS: readonly string[] = Array.from(new Set(REPORTS_HUB_PAGES.flatMap(page => PAGE_ACCESS[page].length === 1 ? PAGE_ACCESS[page][0] : [])));

/** Q-36 (step 3 c): ONE entry for every import — it names each kind of file and sends it where it is imported (the project board's data group, the PMC
 *  import tab, the project base file). It opens for whoever may open at least one of those pages; each card for whoever may open its own. */
export const IMPORT_HUB_PAGES = ["controls", "pmc", "baseline"] as const satisfies readonly PageKey[];
export const IMPORT_HUB_READERS: readonly string[] = Array.from(new Set(IMPORT_HUB_PAGES.flatMap(page => PAGE_ACCESS[page].length === 1 ? PAGE_ACCESS[page][0] : [])));
