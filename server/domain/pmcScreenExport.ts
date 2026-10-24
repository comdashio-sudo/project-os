import { type ExportLocale } from "@shared/exportLocale";
// Flat tables for the Excel export of each PMC screen: the same numbers the screen
// shows, with Arabic or English headers.
import type { activitiesMatrix, approvals, inspections, latestUpdates, pendingAtVerifier, periodReport, stagesView, zones } from "./pmcScreens";

export const PMC_SCREEN_NAMES = ["latestUpdates", "approvals", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages"] as const;
export type PmcScreenName = (typeof PMC_SCREEN_NAMES)[number];
export type ScreenTable = { sheetName: string; headers: string[]; rows: unknown[][] };
type Locale = ExportLocale;
const pick = (locale: Locale, ar: string[], en: string[]) => (locale === "ar" ? ar : en);
const iso = (date: Date) => date.toISOString().slice(0, 10);
// A cell that starts with = + - or @ would run as a formula when opened in a spreadsheet.
const safe = (value: unknown) => (typeof value === "string" && /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value);

export type ScreenData = {
  latestUpdates: ReturnType<typeof latestUpdates>;
  approvals: ReturnType<typeof approvals>;
  inspections: ReturnType<typeof inspections>;
  activities: ReturnType<typeof activitiesMatrix>;
  zones: ReturnType<typeof zones>;
  weekly: ReturnType<typeof periodReport>;
  monthly: ReturnType<typeof periodReport>;
  pending: ReturnType<typeof pendingAtVerifier>;
  stages: ReturnType<typeof stagesView>;
};

export function screenTable<N extends PmcScreenName>(name: N, data: ScreenData[N], locale: Locale): ScreenTable {
  const table = build(name, data as never, locale);
  return { ...table, rows: table.rows.map(row => row.map(safe)) };
}

function build(name: PmcScreenName, data: never, locale: Locale): ScreenTable {
  switch (name) {
    case "latestUpdates": {
      const d = data as ScreenData["latestUpdates"];
      return { sheetName: "updates", headers: pick(locale, ["المهندس", "التحديثات", "الأيام النشطة", "من وحدة", "إلى وحدة", "النسبة المضافة"], ["Engineer", "Updates", "Active days", "From unit", "To unit", "Percent added"]), rows: d.engineers.map(e => [e.name, e.updates, e.activeDays, e.unitFrom, e.unitTo, e.addedProjectPercent]) };
    }
    case "approvals": {
      const d = data as ScreenData["approvals"];
      return { sheetName: "approvals", headers: pick(locale, ["الطلب", "النشاط", "التاريخ", "المقاول", "الاستشاري", "الرد", "الوحدات"], ["Request", "Activity", "Date", "Contractor", "Consultant", "Reply", "Units"]), rows: d.requests.map(r => [r.code, r.activityCode, iso(r.requestedAt), r.contractor ?? "", r.consultant ?? "", r.response ?? "", r.units]) };
    }
    case "inspections": {
      const d = data as ScreenData["inspections"];
      return { sheetName: "inspections", headers: pick(locale, ["الموقف", "العدد", "النسبة"], ["Stage", "Count", "Percent"]), rows: d.byStage.map(s => [s.stage, s.count, s.percent]) };
    }
    case "activities": {
      const d = data as ScreenData["activities"];
      const labels = d.columns.map(c => c.label);
      return { sheetName: "activities", headers: [...pick(locale, ["المجموعة", "النشاط"], ["Group", "Activity"]), ...labels.flatMap(label => [`${label} (${locale === "ar" ? "العدد" : "count"})`, `${label} (${locale === "ar" ? "الوزن" : "weight"})`])], rows: d.groups.flatMap(g => g.activities.map(a => [g.groupCode, a.code, ...a.cells.flatMap(c => [c.count, c.weightPoints])])) };
    }
    case "zones": {
      const d = data as ScreenData["zones"];
      return { sheetName: "zones", headers: pick(locale, ["المنطقة", "المرحلة", "المهندس", "الخلايا", "المكتمل", "الوزن المكتمل", "نسبة الإنجاز"], ["Zone", "Stage", "Engineer", "Cells", "Complete", "Weight complete", "Completion %"]), rows: d.rows.map(r => [r.zoneCode, r.stageCode, r.engineer ?? "", r.cells, r.completeCells, r.weightComplete, r.completionPercent]) };
    }
    case "weekly":
    case "monthly": {
      const d = data as ScreenData["weekly"];
      return { sheetName: name, headers: pick(locale, ["الفترة من", "المهندس", "النشاط", "التحديثات"], ["Period from", "Engineer", "Activity", "Updates"]), rows: d.periods.flatMap(p => p.rows.map(r => [p.from, r.engineer, r.activityCode, r.updates])) };
    }
    case "pending": {
      const d = data as ScreenData["pending"];
      return { sheetName: "pending", headers: pick(locale, ["الوحدة", "النشاط", "حالة التحقق", "المهندس", "منذ", "العمر بالأيام"], ["Unit", "Activity", "Verification status", "Engineer", "Since", "Age (days)"]), rows: d.rows.map(r => [r.unitNumber, r.activityCode, r.verificationStatus, r.engineer ?? "", iso(r.since), r.ageDays]) };
    }
    case "stages": {
      const d = data as ScreenData["stages"];
      return { sheetName: "stages", headers: pick(locale, ["المرحلة", "الحالة", "العدد", "الوزن", "النسبة"], ["Stage", "Status", "Count", "Weight", "Percent"]), rows: d.stages.flatMap(s => s.byStatus.map(b => [s.stageCode, b.status, b.count, b.weightPoints, b.percent])) };
    }
  }
}
