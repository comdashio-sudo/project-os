// Q-12 (D-43): each role sees and edits its own section of the daily report — the server decides, from the permissions a person holds on the project.
//   - site: the header (weather, wind, hours, summary), the work done, the labour matrix, the equipment, the obstacles, the plan for tomorrow and the photos —
//     whoever holds project.field.manage (the site engineer), except the HSE engineer: the HSE template carries project.field.manage for its own field records, so
//     project.field.manage that comes with project.hse.manage and with neither project.progress.manage nor project.manage is the HSE engineer's, not the site's.
//   - hse: the safety events — the HSE engineer (project.hse.manage).
//   - qc: the materials received and the day's inspections (WIR/RFI) — the QA/QC engineer (project.quality.manage or project.qc.receive).
// The site engineer, who prepares and submits the report, edits every section of it (the SITE_ENGINEER template holds HSE and quality anyway).
// Whoever gathers and exports the report sees every section: the project manager (project.manage) and the planning engineer (project.pmc.manage or
// project.schedule.manage). A reader who holds none of the three section powers (a company executive with project.read) reads the whole report too: they edit nothing.
export const REPORT_SECTIONS = ["site", "hse", "qc"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export type ReportSectionAccess = { see: ReportSection[]; edit: ReportSection[]; whole: boolean };

const GATHERERS = ["project.manage", "project.pmc.manage", "project.schedule.manage"] as const;

/** `holds(code)` says whether the person holds that permission on the project. */
export function reportSectionAccess(holds: (code: string) => boolean): ReportSectionAccess {
  const own = REPORT_SECTIONS.filter(section =>
    section === "site" ? holds("project.field.manage") && !(holds("project.hse.manage") && !holds("project.progress.manage") && !holds("project.manage"))
      : section === "hse" ? holds("project.hse.manage")
        : holds("project.quality.manage") || holds("project.qc.receive"));
  // the site engineer prepares the report and submits it: their report carries every section (the HSE and QA/QC engineers add theirs into it)
  const edit = own.includes("site") ? [...REPORT_SECTIONS] : own;
  const whole = GATHERERS.some(holds) || edit.length === 0;
  return { see: whole ? [...REPORT_SECTIONS] : edit, edit, whole };
}
