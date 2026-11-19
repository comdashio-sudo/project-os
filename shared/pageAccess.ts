// Q-33 (P0-04): what each project page needs to be read, written once for both sides. A page is shown (its link drawn, its address opened) only when
// EVERY group holds — a group is one server read the page makes on first render, and any one code of the group satisfies it, exactly as that read's
// server check does. server/pageAccess.database.test.ts calls the real reads for each role and fails if a page's gate and its server disagree.
export type PageAccess = readonly (readonly string[])[];

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
  profitability: [["project.read"]],
  commercial: [["project.read"]],
} as const satisfies Record<string, PageAccess>;
export type PageKey = keyof typeof PAGE_ACCESS;

/** The gate itself, for one holder of these permission codes (the scope check is the caller's: see client/src/lib/permissions.tsx useCanPage). */
export const pageAllowed = (page: PageKey, holds: (codes: readonly string[]) => boolean) => PAGE_ACCESS[page].every(group => holds(group));
