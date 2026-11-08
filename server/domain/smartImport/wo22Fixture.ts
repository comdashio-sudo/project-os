// Work order 22: SYNTHETIC copies of the three sources of the 390-villa project, built from ONE truth so every importer and the comparison can be checked against it.
// Structure only, as the owner described it — no value, name, code or e-mail from the real files (those never enter the repository):
//   1. the monthly report: one sheet ~412 × 151, the report date in V1, the weight of each activity in row 2 (with a TOTAL column, so row 2 adds up to ~2.0), a three-level
//      header in rows 3–5, the WIR number of each activity in row 6, one row per villa from row 7 (390 villas, 4 zones, models R1–R3, 128 activities), then a totals row;
//   2. the consultant's export: one sheet ~406 × 136 with merged cells; rows 1–2 project/client/contractor, row 3 Zone · Zone Ratio · Block · Block Ratio · Cluster · Unit · Ratio ·
//      Villa Type then the CSI sections «name (weight%)», row 4 sub-groups with weights, row 5 the activity, row 6 the location, row 7 «WIR (achieved%)»; cells «Ok» / «-»;
//      summary rows after the villas. Twelve of its WIR numbers differ from the monthly report's;
//   3. the site's workbook (the sheet AppSheet and Apps Script kept): Weights (114), Villa (390), Contractors, Progress Log (villas listed «268 , 270 , 272»), Progress
//      (one row per villa × activity: 44,460), Summary Progress, PLanned P6, Daily, ManPower.
import ExcelJS from "exceljs";

export const WO22_VILLAS = 390;
export const WO22_CATALOG = 128;
export const WO22_SITE = 114;
const SPLIT = 14; // site activities that the catalogue (and the consultant) split into Ground floor + First Floor: 100 + 2 × 14 = 128
const MODELS = ["R1", "R2", "R3"];
const ZONES = ["Z1", "Z2", "Z3", "Z4"];
const SECTIONS = [
  { code: "02", name: "Site Work" }, { code: "03", name: "Concrete" }, { code: "04", name: "Masonry" }, { code: "05", name: "Metals" },
  { code: "07", name: "Thermal and Moisture Protection" }, { code: "08", name: "Openings" }, { code: "09", name: "Finishes" }, { code: "15", name: "Mechanical and Electrical" },
];
const NOUNS = ["footing", "column", "slab", "beam", "block wall", "plaster", "screed", "tiles", "waterproofing", "insulation", "door frame", "window", "paint", "ceiling", "conduit", "piping", "cable", "fixture", "railing", "parapet", "coping", "skirting", "marble", "gypsum", "facade"];
const VERBS = ["Install", "Pour", "Build", "Apply", "Fix", "Lay", "Test", "Finish", "Cure", "Prime"];
const WIR_DIFFERENT = 12;

export type Wo22Truth = {
  reportDate: string; consultantDate: string;
  villas: Array<{ label: string; zone: string; block: string; cluster: string; model: string; area: number; price: number; oracle: string }>;
  site: Array<{ code: string; csi: string; sub: string; name: string; weight: number; catalog: number[] }>;
  catalog: Array<{ name: string; section: string; subgroup: string; location: string; weight: number; wir: string; consultantWir: string; site: number }>;
  /** [villa][catalog] */ monthly: boolean[][]; consultant: boolean[][];
  /** [villa][site] status and dates */ siteStatus: string[][]; siteDate: string[][];
  wirDifferent: number[];
  differences: { siteDoneNotReceived: number; receivedNotDone: number };
  percentages: { monthly: number; consultant: number; site: number };
  legacy: { logRows: number; logVillaRows: number; futureLogRows: number; unknownVillaLogRows: number; dailyRows: number; futureDailyRows: number; planMonths: number; contractors: string[] };
};

const round = (value: number, places = 8) => Math.round(value * 10 ** places) / 10 ** places;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
export const SITE_STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Not Started", IN_PROGRESS: "On Progress", DONE: "Done", INSPECTION_REQUESTED: "Request Inspection", QC_APPROVED: "QC Approval" };
export const isSiteDone = (status: string) => status === "DONE" || status === "INSPECTION_REQUESTED" || status === "QC_APPROVED";

/** The one truth all three files are drawn from. Deterministic. */
export function wo22Truth(options: { reportDate?: Date } = {}): Wo22Truth {
  const reportDate = options.reportDate ?? new Date(Date.UTC(2026, 8, 30));
  const consultantDate = addDays(reportDate, 5);
  // the site's 114 activities, 8 sections × 2 sub-groups, weights adding up to exactly 1.0
  const rawSite = Array.from({ length: WO22_SITE }, (_u, i) => 2 + ((i * 7) % 5) + (i % 3));
  const totalSite = rawSite.reduce((a, b) => a + b, 0);
  const siteWeights = rawSite.map(value => round(value / totalSite, 8));
  siteWeights[WO22_SITE - 1] = round(1 - siteWeights.slice(0, -1).reduce((a, b) => a + b, 0), 8);
  const perSection = Math.ceil(WO22_SITE / SECTIONS.length);
  const site: Wo22Truth["site"] = siteWeights.map((weight, i) => {
    const section = SECTIONS[Math.min(SECTIONS.length - 1, Math.floor(i / perSection))];
    const name = `${VERBS[i % VERBS.length]} ${NOUNS[(i * 3) % NOUNS.length]} ${Math.floor(i / 2) + 1}`;
    return { code: `S${String(i + 1).padStart(3, "0")}`, csi: `${section.code} - ${section.name}`, sub: `${section.name} part ${(i % perSection) < perSection / 2 ? "A" : "B"}`, name, weight, catalog: [] };
  });
  // the catalogue: each site activity is one catalogue activity, except the last SPLIT, which the monthly report and the consultant split by floor
  const catalog: Wo22Truth["catalog"] = [];
  site.forEach((activity, i) => {
    const split = i >= WO22_SITE - SPLIT;
    // a few names differ in the catalogue («works» added), so the name match has something to do
    const named = i % 9 === 4 ? `${activity.name} works` : activity.name;
    const parts = split ? [["Ground floor", 0.5], ["First Floor", 0.5]] as const : [[i % 17 === 3 ? "Boundary Wall" : i % 19 === 5 ? "Annex" : "Whole Building", 1]] as const;
    for (const [location, share] of parts) {
      activity.catalog.push(catalog.length);
      catalog.push({ name: split ? `${named} - ${location}` : named, section: activity.csi, subgroup: activity.sub, location, weight: round(activity.weight * share, 8), wir: "", consultantWir: "", site: i });
    }
  });
  const catalogTotal = catalog.reduce((sum, a) => sum + a.weight, 0);
  catalog[0].weight = round(catalog[0].weight + (1 - catalogTotal), 8); // the halving can leave a residue in the last place
  const wirDifferent: number[] = [];
  catalog.forEach((activity, k) => {
    activity.wir = `WIR-${String(100 + k).padStart(4, "0")}`;
    const differs = k % 10 === 7 && wirDifferent.length < WIR_DIFFERENT;
    if (differs) wirDifferent.push(k);
    activity.consultantWir = differs ? `WIR-${String(900 + k).padStart(4, "0")}` : `WIR-${100 + k}`; // the same number written without its zeros, or a different number
  });

  // the 390 villas: 4 zones, 26 blocks of 15, two clusters per block, models R1–R3, even villa numbers
  const villas: Wo22Truth["villas"] = Array.from({ length: WO22_VILLAS }, (_v, u) => {
    const b = Math.floor(u / 15); const zone = ZONES[b < 7 ? 0 : b < 13 ? 1 : b < 20 ? 2 : 3];
    const block = `B${String(b + 1).padStart(2, "0")}`;
    return { label: String(100 + 2 * u), zone, block, cluster: `${block}-C${(u % 15) < 8 ? 1 : 2}`, model: MODELS[u % 3], area: 300 + (u % 7) * 15, price: 3000 + (u % 5) * 100, oracle: `OR-${zone}-${block}-${String((u % 15) + 1).padStart(3, "0")}` };
  });

  // the monthly report: each villa complete up to a level, along the catalogue's order
  const monthly = villas.map((_v, u) => { const level = (((u + 1) * 37) % 101) / 100; let running = 0; return catalog.map(activity => { running += activity.weight; return running <= level; }); });
  // the consultant: what the report says, except a few received ahead of the report and a few not received yet
  const consultant = monthly.map((row, u) => row.map((done, k) => ((u * 7 + k * 13) % 89 === 0 ? !done : done)));
  // the site: on its own list; done where every catalogue activity it covers is complete in the report, with its own differences
  const siteStatus: string[][] = []; const siteDate: string[][] = [];
  villas.forEach((_v, u) => {
    const statuses: string[] = []; const dates: string[] = [];
    site.forEach((activity, i) => {
      let done = activity.catalog.every(k => monthly[u][k]);
      if ((u * 11 + i * 5) % 83 === 0) done = !done; // the site is ahead or behind the paperwork
      const status = done ? ((u + i) % 7 === 0 ? "QC_APPROVED" : (u + i) % 5 === 0 ? "INSPECTION_REQUESTED" : "DONE") : ((u + i) % 4 === 0 ? "IN_PROGRESS" : "NOT_STARTED");
      statuses.push(status); dates.push(iso(addDays(reportDate, -((u * 3 + i * 2) % 120) - 1)));
    });
    siteStatus.push(statuses); siteDate.push(dates);
  });
  let siteDoneNotReceived = 0; let receivedNotDone = 0;
  villas.forEach((_v, u) => catalog.forEach((activity, k) => {
    const siteDone = isSiteDone(siteStatus[u][activity.site]);
    if (siteDone && !consultant[u][k]) siteDoneNotReceived += 1;
    if (!siteDone && consultant[u][k]) receivedNotDone += 1;
  }));
  const share = (rows: boolean[][], weights: number[]) => rows.reduce((sum, row) => sum + row.reduce((s, done, k) => s + (done ? weights[k] : 0), 0), 0) / rows.length;
  const catalogWeights = catalog.map(a => a.weight);
  const percentages = {
    monthly: share(monthly, catalogWeights), consultant: share(consultant, catalogWeights),
    site: siteStatus.reduce((sum, row) => sum + row.reduce((s, status, i) => s + (isSiteDone(status) ? site[i].weight : 0), 0), 0) / villas.length,
  };
  return {
    reportDate: iso(reportDate), consultantDate: iso(consultantDate), villas, site, catalog, monthly, consultant, siteStatus, siteDate, wirDifferent,
    differences: { siteDoneNotReceived, receivedNotDone }, percentages,
    legacy: { logRows: 0, logVillaRows: 0, futureLogRows: 0, unknownVillaLogRows: 0, dailyRows: 0, futureDailyRows: 0, planMonths: 24, contractors: ["Contractor One Co.", "Contractor Two Est.", "Contractor Three Ltd.", "Contractor Four", "Contractor Five"] },
  };
}

const col = (n: number): string => { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
export { col as wo22Column };

// ------------------------------------------------------------------ 1. the monthly report

export async function buildWo22MonthlyReport(truth: Wo22Truth, options: { consultantFirst?: boolean } = {}): Promise<Uint8Array> {
  void options;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("تقرير الإنجاز", { views: [{ rightToLeft: true }] });
  const FIRST = 19; const LAST = FIRST + WO22_CATALOG - 1; const TOTAL = LAST + 1; const VILLA = TOTAL + 1; const BLOCKCOL = VILLA + 1;
  ws.getCell(1, 1).value = "التقرير الشهري لإنجاز الفلل — نسخة تركيبية"; ws.mergeCells(1, 1, 1, 10);
  ws.getCell(1, 21).value = "تاريخ التقرير"; ws.getCell(1, 22).value = new Date(`${truth.reportDate}T00:00:00Z`); // V1
  ws.getCell(2, 17).value = "وزن البند";
  truth.catalog.forEach((activity, k) => { ws.getCell(2, FIRST + k).value = activity.weight; });
  ws.getCell(2, TOTAL).value = 1; // the total column: row 2 adds up to ~2.0
  const identity = ["م", "كود اوراكيل", "رقم القطعة", "اسم المشروع", "STAGE", "ZONE", "BLOCK", "رمز النموذج", "كود الفيلا", "نسبة الإنجاز"];
  identity.forEach((label, i) => { ws.getCell(3, i + 1).value = label; ws.mergeCells(3, i + 1, 6, i + 1); });
  ws.getCell(3, 11).value = "نسب الأقسام"; ws.mergeCells(3, 11, 3, 18);
  SECTIONS.forEach((section, d) => { ws.getCell(4, 11 + d).value = section.name; ws.getCell(5, 11 + d).value = `Div ${section.code}`; });
  // rows 3–5: phase (the section's half), division (the CSI section), activity
  let start = 0;
  while (start < WO22_CATALOG) {
    const section = truth.catalog[start].section; let end = start;
    while (end + 1 < WO22_CATALOG && truth.catalog[end + 1].section === section) end += 1;
    const code = section.split(" - ")[0];
    ws.getCell(3, FIRST + start).value = Number(code) < 7 ? "المرحلة الأولى: الهيكل" : "المرحلة الثانية: التشطيب";
    ws.getCell(4, FIRST + start).value = `${section} (Division ${code})`;
    if (end > start) ws.mergeCells(4, FIRST + start, 4, FIRST + end);
    start = end + 1;
  }
  truth.catalog.forEach((activity, k) => { ws.getCell(5, FIRST + k).value = activity.name; ws.getCell(6, FIRST + k).value = activity.wir; });
  ws.getCell(5, TOTAL).value = "الإجمالي"; ws.getCell(5, VILLA).value = "نسبة الفيلا";
  ["BLOCK", "ZONE", "عدد الفلل", "نسبة البلوك"].forEach((label, i) => { ws.getCell(5, BLOCKCOL + i).value = label; });
  const percent = truth.monthly.map(row => row.reduce((sum, done, k) => sum + (done ? truth.catalog[k].weight : 0), 0));
  truth.villas.forEach((villa, u) => {
    const r = 7 + u;
    const values: Array<string | number> = [u + 1, villa.oracle, (u % 15) + 1, "مشروع الفلل التركيبي", "المرحلة 1", villa.zone, villa.block, villa.model, villa.label, percent[u]];
    values.forEach((value, i) => { ws.getCell(r, i + 1).value = value; });
    truth.monthly[u].forEach((done, k) => { if (done) ws.getCell(r, FIRST + k).value = 1; });
    ws.getCell(r, TOTAL).value = percent[u]; ws.getCell(r, VILLA).value = percent[u];
  });
  const totals = 7 + WO22_VILLAS;
  ws.getCell(totals, 1).value = "الإجمالي";
  for (let k = 0; k < WO22_CATALOG; k++) ws.getCell(totals, FIRST + k).value = truth.monthly.reduce((sum, row) => sum + (row[k] ? 1 : 0), 0);
  for (let r = totals + 2; r <= totals + 15; r++) ws.getCell(r, 1).value = r === totals + 2 ? "ملاحظات" : `ملاحظة تركيبية ${r - totals - 2}`; // to ~412 rows
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ 2. the consultant's export

export async function buildWo22ConsultantExport(truth: Wo22Truth, options: { received?: boolean[][]; exportDate?: string } = {}): Promise<Uint8Array> {
  const received = options.received ?? truth.consultant;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Progress");
  const FIRST = 9;
  ws.getCell(1, 1).value = "Project: Synthetic Villas 390"; ws.mergeCells(1, 1, 1, 6); ws.getCell(1, 7).value = `Export date: ${options.exportDate ?? truth.consultantDate}`;
  ws.getCell(2, 1).value = "Client: Example Client Co."; ws.mergeCells(2, 1, 2, 4); ws.getCell(2, 5).value = "Contractor: Example Contractor Co."; ws.mergeCells(2, 5, 2, 8);
  ["Zone", "Zone Ratio", "Block", "Block Ratio", "Cluster", "Unit", "Ratio", "Villa Type"].forEach((label, i) => { ws.getCell(3, i + 1).value = label; ws.mergeCells(3, i + 1, 7, i + 1); });
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const groups = (key: "section" | "subgroup", row: number) => {
    let start = 0;
    while (start < WO22_CATALOG) {
      const value = truth.catalog[start][key]; let end = start;
      while (end + 1 < WO22_CATALOG && truth.catalog[end + 1][key] === value) end += 1;
      const weight = truth.catalog.slice(start, end + 1).reduce((sum, a) => sum + a.weight, 0);
      ws.getCell(row, FIRST + start).value = `${value} (${pct(weight)})`;
      if (end > start) ws.mergeCells(row, FIRST + start, row, FIRST + end);
      start = end + 1;
    }
  };
  groups("section", 3); groups("subgroup", 4);
  const achieved = truth.catalog.map((_a, k) => received.reduce((sum, row) => sum + (row[k] ? 1 : 0), 0) / truth.villas.length);
  truth.catalog.forEach((activity, k) => {
    ws.getCell(5, FIRST + k).value = activity.name.replace(/ - (Ground floor|First Floor)$/, "");
    ws.getCell(6, FIRST + k).value = activity.location;
    ws.getCell(7, FIRST + k).value = `${activity.consultantWir} (${pct(achieved[k])})`;
  });
  const villaPercent = received.map(row => row.reduce((sum, done, k) => sum + (done ? truth.catalog[k].weight : 0), 0));
  truth.villas.forEach((villa, u) => {
    const r = 8 + u;
    ws.getCell(r, 1).value = villa.zone; ws.getCell(r, 3).value = villa.block; ws.getCell(r, 5).value = villa.cluster; ws.getCell(r, 6).value = Number(villa.label);
    ws.getCell(r, 7).value = pct(villaPercent[u]); ws.getCell(r, 8).value = villa.model;
    received[u].forEach((done, k) => { ws.getCell(r, FIRST + k).value = done ? "Ok" : "-"; });
  });
  // zone, zone ratio, block, block ratio, cluster: written once and merged down their villas (the export's ~761 merges)
  const mergeDown = (column: number, key: (u: number) => string, ratio?: (members: number[]) => string) => {
    let top = 0;
    for (let u = 1; u <= WO22_VILLAS; u++) {
      if (u < WO22_VILLAS && key(u) === key(top)) continue;
      const members = Array.from({ length: u - top }, (_m, i) => top + i);
      if (ratio) ws.getCell(8 + top, column).value = ratio(members);
      if (u - 1 > top) ws.mergeCells(8 + top, column, 8 + u - 1, column);
      top = u;
    }
  };
  const meanOf = (members: number[]) => pct(members.reduce((sum, u) => sum + villaPercent[u], 0) / members.length);
  mergeDown(1, u => truth.villas[u].zone); mergeDown(2, u => truth.villas[u].zone, meanOf);
  mergeDown(3, u => truth.villas[u].block); mergeDown(4, u => truth.villas[u].block, meanOf);
  mergeDown(5, u => truth.villas[u].cluster);
  // the summary rows after the villas
  const s = 8 + WO22_VILLAS + 1;
  ws.getCell(s, 1).value = "Total Units"; ws.mergeCells(s, 1, s, 8);
  ws.getCell(s + 1, 1).value = "Section Weight"; ws.mergeCells(s + 1, 1, s + 1, 8);
  ws.getCell(s + 2, 1).value = "Activity Weight"; ws.mergeCells(s + 2, 1, s + 2, 8);
  ws.getCell(s + 3, 1).value = "Activity Progress"; ws.mergeCells(s + 3, 1, s + 3, 8);
  ws.getCell(s + 4, 1).value = "Sections Total"; ws.mergeCells(s + 4, 1, s + 4, 8);
  truth.catalog.forEach((activity, k) => {
    ws.getCell(s, FIRST + k).value = received.reduce((sum, row) => sum + (row[k] ? 1 : 0), 0);
    ws.getCell(s + 2, FIRST + k).value = pct(activity.weight); ws.getCell(s + 3, FIRST + k).value = pct(achieved[k]);
  });
  ws.getCell(s + 4, FIRST).value = pct(villaPercent.reduce((a, b) => a + b, 0) / WO22_VILLAS);
  ws.getCell(s + 6, 1).value = "Generated by the consultant's system (synthetic copy)."; ws.getCell(s + 7, 1).value = "Ok = received · - = not received";
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ 3. the site's workbook (Google Sheet export)

export async function buildWo22SiteWorkbook(truth: Wo22Truth): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const weights = wb.addWorksheet("Weights");
  weights.addRow(["CSI", "SUB", "Activity", "Weights"]);
  truth.site.forEach(activity => weights.addRow([activity.csi, activity.sub, activity.name, activity.weight]));
  const villaSheet = wb.addWorksheet("Villa");
  villaSheet.addRow(["Block", "Villa"]);
  truth.villas.forEach(villa => villaSheet.addRow([villa.block, Number(villa.label)]));
  const contractors = wb.addWorksheet("Contractors");
  contractors.addRow(["Name", "Number"]);
  truth.legacy.contractors.forEach((name, i) => contractors.addRow([name, `C-${String(i + 1).padStart(2, "0")}`]));

  // Progress Log: what AppSheet received — several villas in one cell, «268 , 270 , 272». Two rows dated in the future and one naming a villa that does not exist.
  const log = wb.addWorksheet("Progress Log");
  log.addRow(["SN", "CSI", "Activity", "Block", "Villa", "Status", "Date", "Creator Email", "Date Intry", "Time", "Synced"]);
  const report = new Date(`${truth.reportDate}T00:00:00Z`);
  let sn = 0; let villaRows = 0;
  for (let i = 0; i < truth.site.length; i += 6) {
    const activity = truth.site[i];
    for (let b = 0; b < 26; b += 5) {
      const members = truth.villas.map((villa, u) => ({ villa, u })).filter(item => item.villa.block === `B${String(b + 1).padStart(2, "0")}`).slice(0, 3);
      sn += 1; villaRows += members.length;
      const statusWord = isSiteDone(truth.siteStatus[members[0].u][i]) ? "Done" : "On Progress";
      log.addRow([sn, activity.csi, activity.name, members[0].villa.block, members.map(m => m.villa.label).join(" , "), statusWord, addDays(report, -((sn * 3) % 90) - 1), `engineer${(sn % 3) + 1}@site.example.test`, addDays(report, -((sn * 3) % 90)), "08:30", "TRUE"]);
    }
  }
  const future = [addDays(report, 400), addDays(report, 365)];
  for (const date of future) { sn += 1; villaRows += 1; log.addRow([sn, truth.site[0].csi, truth.site[0].name, truth.villas[0].block, truth.villas[0].label, "Done", date, "engineer1@site.example.test", report, "09:00", "TRUE"]); }
  sn += 1; villaRows += 1; log.addRow([sn, truth.site[1].csi, truth.site[1].name, "B99", "9999", "Done", addDays(report, -3), "engineer2@site.example.test", report, "09:10", "TRUE"]);
  truth.legacy.logRows = sn; truth.legacy.logVillaRows = villaRows; truth.legacy.futureLogRows = future.length; truth.legacy.unknownVillaLogRows = 1;

  // Progress: one row per villa × activity (390 × 114 = 44,460)
  const progress = wb.addWorksheet("Progress");
  progress.addRow(["Zone", "Block", "Villa", "Type", "SUB", "Activity", "Weights", "Status", "Status Date", "Entered By", "Not Started", "On Progress", "Done", "Request Inspection", "QC Approval", "Net Sellable Area", "Unit Price", "Cost"]);
  truth.villas.forEach((villa, u) => truth.site.forEach((activity, i) => {
    const status = truth.siteStatus[u][i]; const date = new Date(`${truth.siteDate[u][i]}T00:00:00Z`);
    const order = ["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"]; const reached = order.indexOf(status);
    const at = (step: number) => (step <= reached && step > 0 ? addDays(date, (step - reached) * 3) : null);
    progress.addRow([villa.zone, villa.block, Number(villa.label), villa.model, activity.sub, activity.name, activity.weight, SITE_STATUS_LABEL[status], status === "NOT_STARTED" ? null : date, status === "NOT_STARTED" ? null : `engineer${(u % 3) + 1}@site.example.test`,
      null, at(1), at(2), at(3), at(4), villa.area, villa.price, round(villa.area * villa.price * activity.weight, 2)]);
  }));

  const summary = wb.addWorksheet("Summary Progress");
  summary.addRow(["Activity", "Completed", "In Progress", "Remaining", "Weighted %"]);
  truth.site.forEach((activity, i) => {
    const completed = truth.siteStatus.filter(row => isSiteDone(row[i])).length; const going = truth.siteStatus.filter(row => row[i] === "IN_PROGRESS").length;
    summary.addRow([activity.name, completed, going, WO22_VILLAS - completed - going, round((completed / WO22_VILLAS) * activity.weight, 10)]);
  });

  const plan = wb.addWorksheet("PLanned P6");
  plan.addRow(["Month", "Cost", "Cumulative", "%", "Cumulative %", "Day", "Deviation"]);
  const months = truth.legacy.planMonths; const budget = 390_000_000;
  let cumulative = 0;
  for (let m = 0; m < months; m++) {
    const x = (m + 1) / months; const cumulativeShare = x * x * (3 - 2 * x); // an S
    const monthShare = cumulativeShare - cumulative; cumulative = cumulativeShare;
    plan.addRow([new Date(Date.UTC(2025, m, 1)), round(budget * monthShare, 2), round(budget * cumulativeShare, 2), round(monthShare, 8), round(cumulativeShare, 8), m * 30, null]);
  }

  const daily = wb.addWorksheet("Daily");
  daily.addRow(["Date", "Contractor", "Main Contractor Labour", "Subcontractor Labour", "Equipment", "Equipment Count", "Inspection Status", "Today Progress %", "Remaining Days", "Note", "Problems", "Recommendations", "Photo 1", "Photo 2"]);
  let dailyRows = 0;
  for (let d = 0; d < 20; d++) for (let c = 0; c < 2; c++) {
    dailyRows += 1;
    daily.addRow([addDays(report, -d - 1), truth.legacy.contractors[c], 40 + d, 12 + c, c ? "Mixer" : "Excavator", 1 + (d % 3), ["Approved", "Submitted", "Not Submitted"][(d + c) % 3], round(0.002 + d * 0.0001, 6), 300 - d, "Synthetic note", d % 4 === 0 ? "Synthetic problem" : null, null, `photo-${d}-${c}.jpg`, null]);
  }
  dailyRows += 1; daily.addRow([addDays(report, 200), truth.legacy.contractors[0], 10, 2, "Crane", 1, "Submitted", 0.001, 100, "future", null, null, null, null]);
  truth.legacy.dailyRows = dailyRows; truth.legacy.futureDailyRows = 1;

  const manpower = wb.addWorksheet("ManPower");
  manpower.addRow(["Date", "Contractor", "WBS Code", "Count"]);
  for (let d = 0; d < 20; d++) for (const [code, count] of [["DC-01 Earth Works", 12], ["DC-02 Concrete Works", 25]] as const) manpower.addRow([addDays(report, -d - 1), truth.legacy.contractors[0], code, count + (d % 3)]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
