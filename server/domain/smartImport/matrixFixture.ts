// A SYNTHETIC unit-completion matrix with the structure of a real monthly report the owner described (structure only — no value, name or code from any real project):
// 6 sheets; the main one 579 rows × 160 columns with 111+ merged ranges; row 1 title and report date; row 2 CSI divisions with their weights as text; row 3 the weight of each
// activity (total 1.0); rows 4–6 a three-level header (phase, division in Arabic and English, activity); columns A–J identity (merged 4:6), K–R division percentages,
// S–EX 136 activities (1 = complete, empty = not started), EY the villa percentage, EZ–FD block and zone with their percentages merged down the block's rows;
// rows 7–497 one row per unit (491), row 498 totals, row 504 on a pivot table; a second sheet whose weights are #REF!.
import ExcelJS from "exceljs";

export const MATRIX_SHEET = "الإنجاز التفصيلي للفلل";
export const MATRIX_UNITS = 491;
export const MATRIX_ACTIVITIES = 136;
const DIVISIONS = [
  { code: "02", en: "Site Work", ar: "أعمال الموقع" }, { code: "03", en: "Concrete", ar: "الخرسانة" }, { code: "04", en: "Masonry", ar: "المباني" }, { code: "05", en: "Metals", ar: "المعادن" },
  { code: "07", en: "Thermal and Moisture Protection", ar: "العزل" }, { code: "08", en: "Doors and Windows", ar: "الأبواب والنوافذ" }, { code: "09", en: "Finishes", ar: "التشطيبات" }, { code: "16", en: "Electrical", ar: "الكهرباء" },
];
const PHASES = ["المرحلة الأولى: الهيكل", "المرحلة الثانية: الغلاف", "المرحلة الثالثة: التشطيب", "المرحلة الرابعة: الخدمات"];
const MODELS = ["MDL-A", "MDL-B", "MDL-C", "MDL-D", "MDL-E", "MDL-F"];
export const col = (n: number): string => { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };

export type MatrixTruth = {
  units: number; activities: number; models: string[]; zones: string[]; blocks: string[]; reportDate: string;
  weights: number[]; divisionOf: number[]; oracleCodes: string[]; completeCells: number; unitPercent: number[];
  /** column numbers (1-based) */ firstActivityColumn: number; villaPercentColumn: number;
};

export type MatrixOptions = {
  /** weights that do not total 1.0: the importer must refuse */ brokenWeights?: boolean;
  /** cells (unit index 0-based, activity index 0-based) switched to the opposite state AFTER the percentages were computed, so the file disagrees with itself */ flip?: Array<[number, number]>;
  /** activities already complete in an EARLIER report: the next month adds to them */ completeBefore?: number;
  reportDate?: Date;
  /** unit index (0-based) -> a different Oracle code than the one a previous report gave it */ oracleOverride?: Record<number, string>;
  /** number of units (default 491) */ units?: number;
};

export async function buildMatrixWorkbook(options: MatrixOptions = {}): Promise<{ bytes: Uint8Array; truth: MatrixTruth }> {
  const unitCount = options.units ?? MATRIX_UNITS;
  const reportDate = options.reportDate ?? new Date(Date.UTC(2026, 8, 30));
  // weights: a fixed shape, normalised to total exactly 1.0 (or deliberately not)
  const perDivision = MATRIX_ACTIVITIES / DIVISIONS.length;
  const raw = Array.from({ length: MATRIX_ACTIVITIES }, (_unused, i) => 1 + ((i * 7) % 5) + Math.floor(i / perDivision) * 0.5);
  const total = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map(value => Math.round((value / total) * 1e6) / 1e6);
  weights[weights.length - 1] = Math.round((1 - weights.slice(0, -1).reduce((a, b) => a + b, 0)) * 1e6) / 1e6;
  if (options.brokenWeights) weights[0] = Math.round((weights[0] + 0.01) * 1e6) / 1e6;
  const divisionOf = weights.map((_w, i) => Math.floor(i / perDivision));
  const divisionWeight = DIVISIONS.map((_d, d) => weights.reduce((sum, w, i) => sum + (divisionOf[i] === d ? w : 0), 0));

  // locations: 3 zones, 12 blocks, units spread over them
  const zones = ["Z1", "Z2", "Z3"];
  const blockOfUnit: Array<{ zone: string; block: string; plot: number }> = [];
  const blockCount = 12; const perBlock = Math.ceil(unitCount / blockCount);
  for (let u = 0; u < unitCount; u++) { const b = Math.floor(u / perBlock); blockOfUnit.push({ zone: zones[Math.floor(b / 4)], block: `B${String(b + 1).padStart(2, "0")}`, plot: (u % perBlock) + 1 }); }

  // completion: each unit is complete up to a level, with a few deterministic holes
  const done: boolean[][] = Array.from({ length: unitCount }, (_u, u) => {
    const level = (((u + 1) * 37) % 101) / 100;
    let running = 0;
    return weights.map((w, a) => { running += w; const hole = (u * 31 + a * 17) % 23 === 0; return running <= level && !hole; });
  });
  if (options.completeBefore !== undefined) for (let u = 0; u < unitCount; u++) for (let a = options.completeBefore; a < MATRIX_ACTIVITIES; a++) done[u][a] = false;
  const unitPercent = done.map(row => row.reduce((sum, d, a) => sum + (d ? weights[a] : 0), 0));
  const divisionPercent = done.map(row => DIVISIONS.map((_d, d) => row.reduce((sum, v, a) => sum + (v && divisionOf[a] === d ? weights[a] : 0), 0) / divisionWeight[d]));
  const blocks = Array.from(new Set(blockOfUnit.map(item => item.block)));
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const blockPercent = new Map(blocks.map(block => [block, mean(unitPercent.filter((_p, u) => blockOfUnit[u].block === block))]));
  const zonePercent = new Map(zones.map(zone => [zone, mean(unitPercent.filter((_p, u) => blockOfUnit[u].zone === zone))]));
  for (const [u, a] of options.flip ?? []) done[u][a] = !done[u][a]; // the file now disagrees with its own percentages

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(MATRIX_SHEET, { views: [{ rightToLeft: true }] });
  const FIRST = 19; const LAST = FIRST + MATRIX_ACTIVITIES - 1; const EY = LAST + 1; const BLOCKCOL = EY + 1; // S .. EX, EY, EZ..FD
  ws.getCell(1, 1).value = "تقرير الإنجاز الشهري للفلل — مشروع تجريبي"; ws.mergeCells(1, 1, 1, 7); ws.mergeCells(1, 8, 1, 9);
  ws.getCell(1, 8).value = "تاريخ التقرير"; ws.getCell(1, 10).value = reportDate;
  // row 2: the CSI divisions with their weights as text, merged over the activity columns they cover
  DIVISIONS.forEach((division, d) => {
    const start = FIRST + d * perDivision; const end = start + perDivision - 1;
    ws.getCell(2, start).value = `Division ${division.code}=${(divisionWeight[d] * 100).toFixed(1)}%`;
    ws.mergeCells(2, start, 2, end);
  });
  // row 3: the weight of each activity
  ws.getCell(3, 10).value = "وزن البند";
  weights.forEach((weight, a) => { ws.getCell(3, FIRST + a).value = weight; });
  // rows 4-6: identity headers merged 4:6, division percentages, the three-level activity header
  const identity = ["م", "كود اوراكيل", "رقم القطعة", "اسم المشروع", "STAGE", "ZONE", "BLOCK", "رمز النموذج", "كود الفيلا", "نسبة الإنجاز"];
  identity.forEach((label, i) => { ws.getCell(4, i + 1).value = label; ws.mergeCells(4, i + 1, 6, i + 1); });
  ws.getCell(4, 11).value = "نسب الأقسام"; ws.mergeCells(4, 11, 4, 18);
  DIVISIONS.forEach((division, d) => { ws.getCell(5, 11 + d).value = `${division.ar} ${division.en}`; ws.getCell(6, 11 + d).value = `Div ${division.code}`; });
  PHASES.forEach((phase, p) => { const start = FIRST + p * 2 * perDivision; ws.getCell(4, start).value = phase; ws.mergeCells(4, start, 4, start + 2 * perDivision - 1); });
  DIVISIONS.forEach((division, d) => { const start = FIRST + d * perDivision; ws.getCell(5, start).value = `${division.ar}\n${division.en} (Division ${division.code})`; ws.mergeCells(5, start, 5, start + perDivision - 1); });
  for (let a = 0; a < MATRIX_ACTIVITIES; a++) ws.getCell(6, FIRST + a).value = `${DIVISIONS[divisionOf[a]].ar} — بند ${(a % perDivision) + 1}`;
  ws.getCell(4, EY).value = "نسبة الفيلا"; ws.mergeCells(4, EY, 6, EY);
  ["BLOCK", "ZONE", "عدد الفلل", "نسبة البلوك", "نسبة الزون"].forEach((label, i) => { ws.getCell(4, BLOCKCOL + i).value = label; ws.mergeCells(4, BLOCKCOL + i, 6, BLOCKCOL + i); });
  // rows 7..: one row per unit
  const oracleCodes: string[] = [];
  for (let u = 0; u < unitCount; u++) {
    const row = 7 + u; const place = blockOfUnit[u]; const oracle = options.oracleOverride?.[u] ?? `${place.zone}-${place.block}-${String(place.plot).padStart(3, "0")}`; oracleCodes.push(oracle);
    ws.getCell(row, 1).value = u + 1; ws.getCell(row, 2).value = oracle; ws.getCell(row, 3).value = place.plot; ws.getCell(row, 4).value = "مشروع تجريبي"; ws.getCell(row, 5).value = "المرحلة 1";
    ws.getCell(row, 6).value = place.zone; ws.getCell(row, 7).value = place.block; ws.getCell(row, 8).value = MODELS[u % MODELS.length]; ws.getCell(row, 9).value = `V-${String(u + 1).padStart(4, "0")}`; ws.getCell(row, 10).value = unitPercent[u];
    DIVISIONS.forEach((_d, d) => { ws.getCell(row, 11 + d).value = divisionPercent[u][d]; });
    for (let a = 0; a < MATRIX_ACTIVITIES; a++) if (done[u][a]) ws.getCell(row, FIRST + a).value = 1;
    ws.getCell(row, EY).value = unitPercent[u];
  }
  // the block / zone columns, merged down each block's rows
  let startRow = 7;
  for (const block of blocks) {
    const members = blockOfUnit.map((item, u) => (item.block === block ? u : -1)).filter(u => u >= 0);
    const top = 7 + members[0]; const bottom = 7 + members[members.length - 1];
    ws.getCell(top, BLOCKCOL).value = block; ws.getCell(top, BLOCKCOL + 1).value = blockOfUnit[members[0]].zone; ws.getCell(top, BLOCKCOL + 2).value = members.length;
    ws.getCell(top, BLOCKCOL + 3).value = blockPercent.get(block); ws.getCell(top, BLOCKCOL + 4).value = zonePercent.get(blockOfUnit[members[0]].zone);
    if (bottom > top) for (let i = 0; i < 5; i++) ws.mergeCells(top, BLOCKCOL + i, bottom, BLOCKCOL + i);
    startRow = bottom + 1;
  }
  // the project and stage columns are written once and merged down; footnotes sit between the totals and the pivot
  ws.mergeCells(7, 4, 6 + unitCount, 4);
  for (const zone of zones) { const members = blockOfUnit.map((item, u) => (item.zone === zone ? u : -1)).filter(u => u >= 0); if (members.length > 1) ws.mergeCells(7 + members[0], 5, 7 + members[members.length - 1], 5); }
  for (let r = 499; r <= 503; r++) for (const [from, to] of [[1, 5], [6, 10], [11, 18], [19, 26]]) { ws.getCell(r, from).value = "ملاحظة تركيبية"; ws.mergeCells(r, from, r, to); }
  // totals row and the pivot table below it: neither is a unit
  const totalsRow = 7 + unitCount;
  ws.getCell(totalsRow, 1).value = "الإجمالي";
  for (let a = 0; a < MATRIX_ACTIVITIES; a++) ws.getCell(totalsRow, FIRST + a).value = done.reduce((sum, row) => sum + (row[a] ? 1 : 0), 0);
  ws.getCell(totalsRow, EY).value = mean(unitPercent);
  void startRow;
  const pivotTop = totalsRow + 6;
  ws.getCell(pivotTop, 1).value = "Row Labels"; ws.getCell(pivotTop, 2).value = "Sum of نسبة الفيلا";
  for (let i = 1; i <= 75; i++) { ws.getCell(pivotTop + i, 1).value = i <= unitCount ? `V-${String(i).padStart(4, "0")}` : `x${i}`; ws.getCell(pivotTop + i, 2).value = unitPercent[(i - 1) % unitCount]; }

  // the other five sheets
  const weightsSheet = wb.addWorksheet("نسب الاوزان");
  weightsSheet.addRow(["القسم", "الوزن", "ملاحظة"]);
  DIVISIONS.forEach((division, d) => weightsSheet.addRow([division.ar, d % 3 === 0 ? ({ error: "#REF!" } as unknown as ExcelJS.CellValue) : divisionWeight[d], "مرجع محذوف"]));
  const summary = wb.addWorksheet("ملخص"); summary.addRow(["البلوك", "عدد الفلل", "نسبة البلوك"]); blocks.forEach(block => summary.addRow([block, blockOfUnit.filter(item => item.block === block).length, blockPercent.get(block)]));
  const delivered = wb.addWorksheet("الفلل المسلّمة"); delivered.addRow(["كود الفيلا", "تاريخ التسليم"]); delivered.addRow(["V-0001", new Date(Date.UTC(2026, 7, 15))]);
  const notes = wb.addWorksheet("ملاحظات"); notes.addRow(["هذا الملف تركيبي لاختبار الاستيراد ولا يحوي بيانات حقيقية."]);
  const pivot = wb.addWorksheet("المحوري"); pivot.addRow(["Row Labels", "Sum of نسبة الإنجاز"]); zones.forEach(zone => pivot.addRow([zone, zonePercent.get(zone)]));

  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return {
    bytes,
    truth: { units: unitCount, activities: MATRIX_ACTIVITIES, models: MODELS, zones, blocks, reportDate: reportDate.toISOString().slice(0, 10), weights, divisionOf, oracleCodes, completeCells: done.reduce((sum, row) => sum + row.filter(Boolean).length, 0), unitPercent, firstActivityColumn: FIRST, villaPercentColumn: EY },
  };
}
