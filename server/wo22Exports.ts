// Work order 22: two Excel files the platform now produces instead of the people who used to build them by hand:
//   1. the site ↔ consultant comparison, with the same columns as the AppSheet-against-consultant file it replaces: a sheet per section and a «ملخص»;
//   2. the monthly report in the very shape that is sent to the consultant (the report date in V1, the weights in row 2 with their total, the three-level header,
//      the WIR row, one row per villa) — built from the SITE's record or from the last imported report, and readable again by the platform's own importer.
// Numbers are written as numbers (Western digits by Excel's own display); no personal e-mail or name of a person is written.
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcActivityStages, pmcBlocks, pmcSiteActivityLinks, pmcSiteCells, pmcUnitActivityProgress, pmcUnits, pmcZones, projects } from "../drizzle/schema";
import { isSiteDone, pmcComparisonAll, type ComparisonRow } from "./pmcSiteService";
import { pmcGate, siteToday, type Scope } from "./wo22Shared";

const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const SITE_WORD: Record<string, string> = { NOT_STARTED: "Not Started", IN_PROGRESS: "On Progress", DONE: "Done", INSPECTION_REQUESTED: "Request Inspection", QC_APPROVED: "QC Approval" };
const RESULT: Record<string, string> = { site_done_not_received: "منتهي في الموقع ولم يُسلَّم للاستشاري", received_not_done: "مستلَم من الاستشاري ولم يُحدَّث في الموقع" };
export const COMPARISON_COLUMNS = ["المنطقة", "البلوك", "الفيلا", "النموذج", "القسم", "رقم WIR", "البند (AppSheet)", "Activity (الاستشاري)", "حالة AppSheet", "تاريخ Done", "عند الاستشاري", "النتيجة", "ملاحظة (عمر الفرق)", "ملاحظة الموقع"];
const sheetName = (value: string, used: Set<string>) => { let name = (value || "—").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "—"; for (let n = 2; used.has(name); n++) name = `${name.slice(0, 25)} ${n}`; used.add(name); return name; };
const toBase64 = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");

export function comparisonRowValues(row: ComparisonRow) {
  return [row.zone, row.block, Number(row.villa) || row.villa, row.modelCode, row.section, row.wir ?? "", row.siteActivity, row.consultantActivity,
    (row.siteStatus ?? "").split(" · ").map(status => SITE_WORD[status] ?? status).join(" · "), row.doneOn ?? "", row.consultantStatus === "NOT_RECEIVED" ? "غير مستلَم" : "مستلَم",
    row.kind ? RESULT[row.kind] : "", row.ageDays === null ? "" : `منذ ${row.ageDays} يومًا`, row.note ?? ""];
}

export async function exportComparisonWorkbook(input: Scope) {
  const { rows, summary } = await pmcComparisonAll(input);
  const wb = new ExcelJS.Workbook(); const used = new Set<string>();
  const head = wb.addWorksheet(sheetName("ملخص", used), { views: [{ rightToLeft: true }] });
  head.addRow(["القسم", "قورن", "منتهٍ عند الطرفين", "لم يبدأ عند الطرفين", RESULT.site_done_not_received, RESULT.received_not_done]);
  for (const item of summary) head.addRow([item.section, item.compared, item.bothDone, item.neither, item.siteDoneNotReceived, item.receivedNotDone]);
  head.addRow(["الإجمالي", summary.reduce((s, i) => s + i.compared, 0), summary.reduce((s, i) => s + i.bothDone, 0), summary.reduce((s, i) => s + i.neither, 0), summary.reduce((s, i) => s + i.siteDoneNotReceived, 0), summary.reduce((s, i) => s + i.receivedNotDone, 0)]);
  head.getRow(1).font = { bold: true };
  for (const section of summary.map(item => item.section)) {
    const ws = wb.addWorksheet(sheetName(section, used), { views: [{ rightToLeft: true }] });
    ws.addRow(COMPARISON_COLUMNS); ws.getRow(1).font = { bold: true };
    for (const row of rows.filter(item => item.section === section)) ws.addRow(comparisonRowValues(row));
    ws.columns.forEach(column => { column.width = 18; });
  }
  const db = await pmcGate(input, "project.pmc.read");
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_export_generated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ export: "pmc_site_consultant_comparison", rows: rows.length }) });
  return { fileName: `site-consultant-comparison-${siteToday()}.xlsx`, base64: await toBase64(wb), rows: rows.length };
}

/** The monthly report, in the shape the consultant receives. `source`: the site's record (default) or the last imported report. */
export async function exportMonthlyReportWorkbook(input: Scope & { source?: "site" | "monthly"; reportDate?: string }) {
  const db = await pmcGate(input, "project.pmc.read");
  const source = input.source ?? "site"; const reportDate = input.reportDate ?? siteToday();
  const [project] = await db.select({ name: projects.name }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  const [zones, blocks, units, defs, stages, groups] = await Promise.all([
    db.select({ id: pmcZones.id, code: pmcZones.code }).from(pmcZones).where(mine(pmcZones, input)),
    db.select({ id: pmcBlocks.id, name: pmcBlocks.name, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(mine(pmcBlocks, input)),
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId, externalCode: pmcUnits.externalCode }).from(pmcUnits).where(mine(pmcUnits, input)),
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode, weightPercent: pmcActivityDefinitions.weightPercent, wirCode: pmcActivityDefinitions.wirCode, stageId: pmcActivityDefinitions.stageId, groupId: pmcActivityDefinitions.groupId, createdAt: pmcActivityDefinitions.createdAt }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ id: pmcActivityStages.id, code: pmcActivityStages.code, name: pmcActivityStages.name }).from(pmcActivityStages).where(mine(pmcActivityStages, input)),
    db.select({ id: pmcActivityGroups.id, name: pmcActivityGroups.name }).from(pmcActivityGroups).where(mine(pmcActivityGroups, input)),
  ]);
  // one column per catalogue activity, in the catalogue's own order (the first model's copy carries the weight and the WIR)
  const firstModel = units[0]?.modelCode ?? defs[0]?.modelCode;
  // (the catalogue is written in one statement, so its rows share a creation time: the order is the section, then the WIR number, then the code)
  const stageName = new Map(stages.map(stage => [stage.id, stage])); const groupName = new Map(groups.map(group => [group.id, group.name]));
  const wirOrder = (value: string | null) => { const match = (value ?? "").match(/\d+/g); return match ? Number(match[match.length - 1]) : Number.MAX_SAFE_INTEGER; };
  const columns = defs.filter(def => def.modelCode === firstModel).sort((a, b) => (stageName.get(a.stageId)?.code ?? "").localeCompare(stageName.get(b.stageId)?.code ?? "") || wirOrder(a.wirCode) - wirOrder(b.wirCode) || a.code.localeCompare(b.code));
  const defByModelCode = new Map(defs.map(def => [`${def.modelCode}|${def.code}`, def]));
  const blockById = new Map(blocks.map(block => [block.id, block])); const zoneById = new Map(zones.map(zone => [zone.id, zone]));
  // which cells are complete, from the chosen source
  const complete = new Set<string>(); // unitId|code
  if (source === "monthly") {
    const progress = await db.select({ unitId: pmcUnitActivityProgress.unitId, defId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, input));
    const codeOf = new Map(defs.map(def => [def.id, def.code]));
    for (const cell of progress) if (cell.status === "COMPLETE") complete.add(`${cell.unitId}|${codeOf.get(cell.defId)}`);
  } else {
    const [links, cells] = await Promise.all([
      db.select({ siteActivityId: pmcSiteActivityLinks.siteActivityId, activityCode: pmcSiteActivityLinks.activityCode }).from(pmcSiteActivityLinks).where(and(mine(pmcSiteActivityLinks, input), eq(pmcSiteActivityLinks.confirmed, true))),
      db.select({ unitId: pmcSiteCells.unitId, siteActivityId: pmcSiteCells.siteActivityId, status: pmcSiteCells.status }).from(pmcSiteCells).where(mine(pmcSiteCells, input)),
    ]);
    const siteFor = new Map<string, string[]>(); for (const link of links) siteFor.set(link.activityCode, [...(siteFor.get(link.activityCode) ?? []), link.siteActivityId]);
    const done = new Set(cells.filter(cell => isSiteDone(cell.status)).map(cell => `${cell.unitId}|${cell.siteActivityId}`));
    for (const unit of units) for (const column of columns) { const ids = siteFor.get(column.code) ?? []; if (ids.length && ids.every(id => done.has(`${unit.id}|${id}`))) complete.add(`${unit.id}|${column.code}`); }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("تقرير الإنجاز", { views: [{ rightToLeft: true }] });
  const divisions = Array.from(new Set(columns.map(column => column.stageId)));
  const identity = ["م", "كود اوراكيل", "رقم القطعة", "اسم المشروع", "STAGE", "ZONE", "BLOCK", "رمز النموذج", "كود الفيلا", "نسبة الإنجاز"];
  const DIV = identity.length + 1; const FIRST = DIV + divisions.length; const TOTAL = FIRST + columns.length; const VILLA = TOTAL + 1;
  ws.getCell(1, 1).value = `التقرير الشهري لإنجاز الفلل — ${project?.name ?? ""}`;
  ws.getCell(1, 21).value = "تاريخ التقرير"; ws.getCell(1, 22).value = new Date(`${reportDate}T00:00:00Z`); // V1
  ws.getCell(2, FIRST - 1).value = "وزن البند";
  columns.forEach((column, k) => { ws.getCell(2, FIRST + k).value = Number(column.weightPercent) / 100; });
  ws.getCell(2, TOTAL).value = Math.round(columns.reduce((sum, column) => sum + Number(column.weightPercent) / 100, 0) * 1e6) / 1e6;
  identity.forEach((label, i) => { ws.getCell(3, i + 1).value = label; ws.mergeCells(3, i + 1, 6, i + 1); });
  divisions.forEach((stageId, d) => { ws.getCell(4, DIV + d).value = stageName.get(stageId)?.name ?? ""; ws.getCell(5, DIV + d).value = `Div ${stageName.get(stageId)?.code ?? d + 1}`; });
  let start = 0;
  while (start < columns.length) {
    let end = start; while (end + 1 < columns.length && columns[end + 1].stageId === columns[start].stageId) end += 1;
    ws.getCell(3, FIRST + start).value = groupName.get(columns[start].groupId) ?? "";
    ws.getCell(4, FIRST + start).value = stageName.get(columns[start].stageId)?.name ?? "";
    if (end > start) ws.mergeCells(4, FIRST + start, 4, FIRST + end);
    start = end + 1;
  }
  columns.forEach((column, k) => { ws.getCell(5, FIRST + k).value = column.name; ws.getCell(6, FIRST + k).value = column.wirCode ?? column.code; });
  ws.getCell(5, TOTAL).value = "الإجمالي"; ws.getCell(5, VILLA).value = "نسبة الفيلا";
  const ordered = [...units].sort((a, b) => a.unitNumber - b.unitNumber);
  ordered.forEach((unit, u) => {
    const r = 7 + u; const block = blockById.get(unit.blockId); const zone = block ? zoneById.get(block.zoneId) : undefined;
    let percent = 0;
    columns.forEach((column, k) => {
      const own = defByModelCode.get(`${unit.modelCode}|${column.code}`);
      if (own && complete.has(`${unit.id}|${column.code}`)) { ws.getCell(r, FIRST + k).value = 1; percent += Number(own.weightPercent) / 100; }
    });
    const divisionPercent = divisions.map(stageId => { const own = columns.filter(column => column.stageId === stageId); const total = own.reduce((s, c) => s + Number(c.weightPercent), 0); return total ? own.reduce((s, c) => s + (complete.has(`${unit.id}|${c.code}`) ? Number(c.weightPercent) : 0), 0) / total : 0; });
    [unit.unitNumber, unit.externalCode ?? "", unit.unitNumber, project?.name ?? "", "", zone?.code ?? "", block?.name ?? "", unit.modelCode, unit.villaLabel ?? "", Math.round(percent * 1e6) / 1e6].forEach((value, i) => { ws.getCell(r, i + 1).value = value; });
    divisionPercent.forEach((value, d) => { ws.getCell(r, DIV + d).value = Math.round(value * 1e6) / 1e6; });
    ws.getCell(r, TOTAL).value = Math.round(percent * 1e6) / 1e6; ws.getCell(r, VILLA).value = Math.round(percent * 1e6) / 1e6;
  });
  const totals = 7 + ordered.length;
  ws.getCell(totals, 1).value = "الإجمالي";
  columns.forEach((column, k) => { ws.getCell(totals, FIRST + k).value = ordered.filter(unit => complete.has(`${unit.id}|${column.code}`)).length; });
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_export_generated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ export: "pmc_monthly_report", source, reportDate, villas: ordered.length }) });
  return { fileName: `monthly-report-${reportDate}-${source}.xlsx`, base64: await toBase64(wb), villas: ordered.length, activities: columns.length, completeCells: complete.size, source };
}
