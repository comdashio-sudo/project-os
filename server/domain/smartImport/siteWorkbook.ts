// Work order 22: the site's old workbook (the Google Sheet that AppSheet wrote to and Apps Script reshaped), read once to bring its history into the platform.
// Sheets are found by name (spacing and case do not matter) and columns by their heading, never by position. What cannot be taken is listed with its reason
// (a date in the future, a status the platform does not know, a missing field) — the importer adds what only the database can say (a villa that does not exist).
// The person who entered a row is never kept as an e-mail: history brought in from the sheet is entered by «مُستورد».
import { parseDate } from "./dates";
import { parseNumber } from "./numbers";
import type { Cell, SheetGrid } from "./sheetReader";

export const SITE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const IMPORTED_BY = "مُستورد";

const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9؀-ۿ%]+/g, "");
/** «Done», «QC Approval», «On Progress» … → the platform's status; null when unknown. */
export function siteStatusOf(value: string): SiteStatus | null {
  const word = key(value);
  if (/^(notstarted|notstart|لميبدا|لميبدأ)$/.test(word)) return "NOT_STARTED";
  if (/^(onprogress|inprogress|ongoing|progress|جار|جاري|جارٍ)$/.test(word)) return "IN_PROGRESS";
  if (/^(done|completed|complete|finished|منته|منتهي|مكتمل)$/.test(word)) return "DONE";
  if (/^(requestinspection|inspectionrequested|requestedinspection|wir|طلبالفحص)$/.test(word)) return "INSPECTION_REQUESTED";
  if (/^(qcapproval|qcapproved|approved|اعتمدqc)$/.test(word)) return "QC_APPROVED";
  return null;
}
const dateOf = (cell: Cell | undefined) => (cell === null || cell === undefined || cell === "" ? null : parseDate(cell as never)?.iso ?? null);
const numberOf = (cell: Cell | undefined) => (cell === null || cell === undefined || cell === "" ? null : parseNumber(cell)?.value ?? null);
/** «268 , 270 , 272» → ["268", "270", "272"] (what Apps Script split into one row per villa) */
export const villaList = (value: string) => value.split(/[,،;\n]+/).map(item => item.trim()).filter(Boolean).map(item => (/^\d+$/.test(item) ? String(Number(item)) : item));

type Table = { name: string; header: string[]; rows: Array<{ row: number; get: (...names: string[]) => Cell }> };
function table(sheet: SheetGrid | undefined): Table | null {
  if (!sheet || sheet.rows.length < 2) return null;
  let headerRow = 0;
  for (let r = 0; r < Math.min(5, sheet.rows.length); r++) if (sheet.rows[r].filter(cell => text(cell)).length >= 2) { headerRow = r; break; }
  const header = sheet.rows[headerRow].map(cell => key(text(cell)));
  const rows = sheet.rows.slice(headerRow + 1).map((cells, i) => ({
    row: headerRow + i + 2,
    get: (...names: string[]) => { for (const name of names) { const at = header.indexOf(key(name)); if (at >= 0) return cells[at] ?? null; } return null; },
  })).filter(item => Object.values(sheet.rows[item.row - 1] ?? []).some(cell => text(cell)));
  return { name: sheet.name, header, rows };
}

export type SiteRejection = { sheet: string; row: number; reason: string; detail?: string };
export type SiteWorkbook = {
  activities: Array<{ row: number; csi: string; sub: string; name: string; weight: number }>;
  villas: Array<{ row: number; block: string; villa: string }>;
  contractors: Array<{ row: number; name: string; number: string | null }>;
  log: Array<{ row: number; sn: string; activity: string; block: string; villa: string; status: SiteStatus; date: string }>;
  progress: Array<{ row: number; zone: string; block: string; villa: string; type: string; activity: string; weight: number | null; status: SiteStatus; statusDate: string | null; dates: Partial<Record<SiteStatus, string>>; area: number | null; price: number | null }>;
  summary: Array<{ row: number; activity: string; completed: number; inProgress: number; remaining: number; weighted: number | null }>;
  plan: Array<{ row: number; month: string; cost: number | null; percent: number; cumulativePercent: number }>;
  daily: Array<{ row: number; date: string; contractor: string; mainLabour: number | null; subLabour: number | null; equipment: string | null; equipmentCount: number | null; inspectionStatus: string | null; todayPercent: number | null; remainingDays: number | null; note: string | null; problems: string | null; recommendations: string | null; photos: string[] }>;
  manpower: Array<{ row: number; date: string; contractor: string; wbsCode: string; count: number }>;
  rejected: SiteRejection[];
  sheets: { found: string[]; missing: string[] };
};

const SHEETS = { weights: "weights", villa: "villa", contractors: "contractors", log: "progresslog", progress: "progress", summary: "summaryprogress", plan: "plannedp6", daily: "daily", manpower: "manpower" } as const;

/** Is this workbook the site's sheet? Weights + Progress (or Progress Log) by name, with their headings. */
export function isSiteWorkbook(sheets: SheetGrid[]) {
  const names = new Set(sheets.map(sheet => key(sheet.name)));
  return names.has(SHEETS.weights) && (names.has(SHEETS.progress) || names.has(SHEETS.log));
}

export function readSiteWorkbook(sheets: SheetGrid[], asOf: string): SiteWorkbook {
  const byName = new Map(sheets.map(sheet => [key(sheet.name), sheet]));
  const found = Object.values(SHEETS).filter(name => byName.has(name)); const missing = Object.values(SHEETS).filter(name => !byName.has(name));
  const rejected: SiteRejection[] = [];
  const reject = (sheet: string, row: number, reason: string, detail?: string) => { rejected.push({ sheet, row, reason, detail }); };
  const future = (date: string | null) => date !== null && date > asOf;

  const out: SiteWorkbook = { activities: [], villas: [], contractors: [], log: [], progress: [], summary: [], plan: [], daily: [], manpower: [], rejected, sheets: { found, missing } };
  const weights = table(byName.get(SHEETS.weights));
  for (const item of weights?.rows ?? []) {
    const name = text(item.get("Activity")); const weight = numberOf(item.get("Weights", "Weight"));
    if (!name) { reject("Weights", item.row, "SITE_FIELD_MISSING", "Activity"); continue; }
    if (weight === null || weight < 0) { reject("Weights", item.row, "SITE_WEIGHT_INVALID", name); continue; }
    out.activities.push({ row: item.row, csi: text(item.get("CSI")), sub: text(item.get("SUB")), name, weight });
  }
  for (const item of table(byName.get(SHEETS.villa))?.rows ?? []) {
    const villa = text(item.get("Villa")); if (!villa) continue;
    out.villas.push({ row: item.row, block: text(item.get("Block")), villa: villaList(villa)[0] ?? villa });
  }
  for (const item of table(byName.get(SHEETS.contractors))?.rows ?? []) {
    const name = text(item.get("Name", "Contractor")); if (!name) continue;
    out.contractors.push({ row: item.row, name, number: text(item.get("Number", "No")) || null });
  }
  for (const item of table(byName.get(SHEETS.log))?.rows ?? []) {
    const activity = text(item.get("Activity")); const status = siteStatusOf(text(item.get("Status"))); const date = dateOf(item.get("Date"));
    const villas = villaList(text(item.get("Villa")));
    if (!activity || !villas.length || !date) { reject("Progress Log", item.row, "SITE_FIELD_MISSING", !activity ? "Activity" : !villas.length ? "Villa" : "Date"); continue; }
    if (!status) { reject("Progress Log", item.row, "SITE_STATUS_UNKNOWN", text(item.get("Status"))); continue; }
    if (future(date)) { reject("Progress Log", item.row, "SITE_DATE_IN_FUTURE", date); continue; }
    // one row per villa, the way Apps Script split it — and never the e-mail of the person who typed it
    for (const villa of villas) out.log.push({ row: item.row, sn: text(item.get("SN")), activity, block: text(item.get("Block")), villa, status, date });
  }
  for (const item of table(byName.get(SHEETS.progress))?.rows ?? []) {
    const activity = text(item.get("Activity")); const villa = villaList(text(item.get("Villa")))[0];
    const statusText = text(item.get("Status"));
    const status = statusText ? siteStatusOf(statusText) : "NOT_STARTED";
    if (!activity || !villa) { reject("Progress", item.row, "SITE_FIELD_MISSING", !activity ? "Activity" : "Villa"); continue; }
    if (!status) { reject("Progress", item.row, "SITE_STATUS_UNKNOWN", statusText); continue; }
    const dates: Partial<Record<SiteStatus, string>> = {};
    for (const [label, step] of [["Not Started", "NOT_STARTED"], ["On Progress", "IN_PROGRESS"], ["Done", "DONE"], ["Request Inspection", "INSPECTION_REQUESTED"], ["QC Approval", "QC_APPROVED"]] as const) { const value = dateOf(item.get(label)); if (value) dates[step] = value; }
    const statusDate = dateOf(item.get("Status Date", "Date"));
    const tooLate = [statusDate, ...Object.values(dates)].find(value => future(value ?? null));
    if (tooLate) { reject("Progress", item.row, "SITE_DATE_IN_FUTURE", tooLate); continue; }
    out.progress.push({ row: item.row, zone: text(item.get("Zone")), block: text(item.get("Block")), villa, type: text(item.get("Type")), activity, weight: numberOf(item.get("Weights", "Weight")), status, statusDate, dates, area: numberOf(item.get("Net Sellable Area", "Area")), price: numberOf(item.get("Unit Price", "Price")) });
  }
  for (const item of table(byName.get(SHEETS.summary))?.rows ?? []) {
    const activity = text(item.get("Activity")); if (!activity) continue;
    out.summary.push({ row: item.row, activity, completed: numberOf(item.get("Completed")) ?? 0, inProgress: numberOf(item.get("In Progress")) ?? 0, remaining: numberOf(item.get("Remaining")) ?? 0, weighted: numberOf(item.get("Weighted %", "Weighted")) });
  }
  for (const item of table(byName.get(SHEETS.plan))?.rows ?? []) {
    const month = dateOf(item.get("Month")); const percent = numberOf(item.get("%")); const cumulative = numberOf(item.get("Cumulative %"));
    if (!month || percent === null || cumulative === null) { reject("PLanned P6", item.row, "SITE_FIELD_MISSING", !month ? "Month" : "%"); continue; }
    out.plan.push({ row: item.row, month: `${month.slice(0, 7)}-01`, cost: numberOf(item.get("Cost")), percent, cumulativePercent: cumulative });
  }
  for (const item of table(byName.get(SHEETS.daily))?.rows ?? []) {
    const date = dateOf(item.get("Date")); const contractor = text(item.get("Contractor"));
    if (!date || !contractor) { reject("Daily", item.row, "SITE_FIELD_MISSING", !date ? "Date" : "Contractor"); continue; }
    if (future(date)) { reject("Daily", item.row, "SITE_DATE_IN_FUTURE", date); continue; }
    const optional = (...names: string[]) => text(item.get(...names)) || null;
    out.daily.push({
      row: item.row, date, contractor, mainLabour: numberOf(item.get("Main Contractor Labour", "Main Labour")), subLabour: numberOf(item.get("Subcontractor Labour", "Sub Labour")),
      equipment: optional("Equipment"), equipmentCount: numberOf(item.get("Equipment Count")), inspectionStatus: optional("Inspection Status"), todayPercent: numberOf(item.get("Today Progress %", "Today %")),
      remainingDays: numberOf(item.get("Remaining Days")), note: optional("Note"), problems: optional("Problems"), recommendations: optional("Recommendations"),
      photos: [optional("Photo 1"), optional("Photo 2")].filter((value): value is string => Boolean(value)),
    });
  }
  for (const item of table(byName.get(SHEETS.manpower))?.rows ?? []) {
    const date = dateOf(item.get("Date")); const code = text(item.get("WBS Code", "WBS")); const count = numberOf(item.get("Count", "Labour"));
    if (!date || !code || count === null) { reject("ManPower", item.row, "SITE_FIELD_MISSING", !date ? "Date" : !code ? "WBS Code" : "Count"); continue; }
    if (future(date)) { reject("ManPower", item.row, "SITE_DATE_IN_FUTURE", date); continue; }
    out.manpower.push({ row: item.row, date, contractor: text(item.get("Contractor")), wbsCode: code, count });
  }
  return out;
}
