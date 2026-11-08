import { beforeAll, describe, expect, it } from "vitest";
import { nameScore, suggestLinks } from "../pmcActivityMatch";
import { detectConsultantExport, nameAndPercent, wirNumber, type ConsultantModel } from "./consultantExport";
import { detectMatrix, reconcile, validateMatrix, villaLabelOf, type MatrixModel } from "./matrix";
import { readGrid, type SheetGrid } from "./sheetReader";
import { isSiteWorkbook, readSiteWorkbook, siteStatusOf, villaList, type SiteWorkbook } from "./siteWorkbook";
import { buildWo22ConsultantExport, buildWo22MonthlyReport, buildWo22SiteWorkbook, isSiteDone, WO22_CATALOG, WO22_SITE, WO22_VILLAS, wo22Truth, type Wo22Truth } from "./wo22Fixture";

// Work order 22: the three sources of the 390-villa project, read from SYNTHETIC copies with the structure the owner described (the real files never enter the repository).
let truth: Wo22Truth;
let monthly: MatrixModel; let consultant: ConsultantModel; let site: SiteWorkbook; let monthlyGrid: SheetGrid; let consultantGrid: SheetGrid;
const grid = async (bytes: Uint8Array) => { const read = await readGrid(bytes, "xlsx"); if (!read.ok) throw new Error(read.code); return read.sheets; };

beforeAll(async () => {
  truth = wo22Truth();
  monthlyGrid = (await grid(await buildWo22MonthlyReport(truth)))[0];
  consultantGrid = (await grid(await buildWo22ConsultantExport(truth)))[0];
  const detectedMonthly = detectMatrix(monthlyGrid); if (!detectedMonthly.ok) throw new Error(detectedMonthly.reason); monthly = detectedMonthly.model;
  const detectedConsultant = detectConsultantExport(consultantGrid); if (!detectedConsultant.ok) throw new Error(detectedConsultant.reason); consultant = detectedConsultant.model;
  const sheets = await grid(await buildWo22SiteWorkbook(truth));
  expect(isSiteWorkbook(sheets)).toBe(true);
  site = readSiteWorkbook(sheets, truth.reportDate);
}, 180_000);

describe("the monthly report with its WIR row", () => {
  it("is the shape the owner described: ~412 × 151, date in V1, 390 villas, 4 zones, R1–R3, 128 activities", () => {
    expect(monthlyGrid.rows.length).toBe(412);
    expect(monthlyGrid.rows[0].length).toBeGreaterThanOrEqual(150);
    expect(monthly.reportDate).toBe(truth.reportDate);
    expect(monthly.units).toHaveLength(WO22_VILLAS);
    expect(new Set(monthly.units.map(unit => unit.zone)).size).toBe(4);
    expect(Array.from(new Set(monthly.units.map(unit => unit.modelCode))).sort()).toEqual(["R1", "R2", "R3"]);
    expect(monthly.activities).toHaveLength(WO22_CATALOG);
  });
  it("finds the TOTAL column in the weights row (row 2 adds up to ~2.0) and leaves it out: the activities add up to 1.0", () => {
    const rowTwo = (monthlyGrid.rows[1].filter(cell => typeof cell === "number") as number[]).reduce((a, b) => a + b, 0);
    expect(rowTwo).toBeGreaterThan(1.99); expect(rowTwo).toBeLessThan(2.01);
    expect(monthly.weightsRow).toBe(2); expect(monthly.totalColumn).not.toBeNull();
    expect(validateMatrix(monthly)).toEqual([]);
    expect(reconcile(monthly).unitMatchShare).toBe(1);
  });
  it("reads the WIR number of every activity from row 6, and the units from row 7", () => {
    expect(monthly.wirRow).toBe(6);
    expect(monthly.activities.map(activity => activity.wir)).toEqual(truth.catalog.map(activity => activity.wir));
    expect(monthly.units[0].row).toBe(7);
    expect(monthly.units.map(unit => unit.villaLabel)).toEqual(truth.villas.map(villa => villa.label));
    expect(monthly.units.reduce((sum, unit) => sum + unit.complete.filter(Boolean).length, 0)).toBe(truth.monthly.flat().filter(Boolean).length);
  });
  it("the villa number is the digits of the villa code, else the plot", () => {
    expect(villaLabelOf("V-0268", "")).toBe("268"); expect(villaLabelOf("فيلا 270", "")).toBe("270"); expect(villaLabelOf("", "272")).toBe("272"); expect(villaLabelOf("", "")).toBeNull();
  });
});

describe("the consultant's export", () => {
  it("is the shape the owner described: ~406 × 136 with hundreds of merged cells", () => {
    expect(consultantGrid.rows.length).toBe(406);
    expect(consultantGrid.rows[0].length).toBe(136);
    expect(consultantGrid.mergeRanges).toBeGreaterThan(130);
  });
  it("reads project, client, contractor and the export date from rows 1–2", () => {
    expect(consultant).toMatchObject({ project: "Synthetic Villas 390", client: "Example Client Co.", contractor: "Example Contractor Co.", exportDate: truth.consultantDate, headerRow: 3 });
  });
  it("reads every column: section and sub-group with their weights, activity, location, WIR and the achieved percentage", () => {
    expect(consultant.columns).toHaveLength(WO22_CATALOG);
    const first = consultant.columns[0];
    expect(first.wir).toBe(truth.catalog[0].consultantWir);
    expect(first.section).toBe(truth.catalog[0].section);
    expect(first.sectionWeight).toBeGreaterThan(0);
    expect(new Set(consultant.columns.map(column => column.location))).toEqual(new Set(["Whole Building", "Ground floor", "First Floor", "Boundary Wall", "Annex"]));
    expect(new Set(consultant.columns.map(column => column.key)).size).toBe(WO22_CATALOG);
  });
  it("reads «Ok» as received and «-» as not, for 390 villas, and stops before the summary rows", () => {
    expect(consultant.units).toHaveLength(WO22_VILLAS);
    expect(consultant.units.map(unit => unit.unit)).toEqual(truth.villas.map(villa => villa.label));
    expect(consultant.units.map(unit => unit.zone)).toEqual(truth.villas.map(villa => villa.zone)); // vertically merged: filled the way Excel shows them
    expect(consultant.units.map(unit => unit.received)).toEqual(truth.consultant);
    expect(consultant.summaryRows).toBeGreaterThanOrEqual(5);
    expect(consultant.unexpectedCells).toEqual([]);
  });
  it("matches WIR numbers whatever their zeros, and finds the twelve that differ from the monthly report", () => {
    expect(wirNumber("WIR-0105")).toBe(wirNumber("WIR-105")); expect(wirNumber("WIR 105")).toBe("105");
    expect(nameAndPercent("Concrete (12.50%)")).toEqual({ name: "Concrete", percent: 0.125 });
    const monthlyWirs = new Set(monthly.activities.map(activity => wirNumber(activity.wir)));
    const different = consultant.columns.filter(column => !monthlyWirs.has(wirNumber(column.wir)));
    expect(different).toHaveLength(12);
  });
  it("is not mistaken for a monthly report, nor the report for an export", () => {
    expect(detectMatrix(consultantGrid).ok).toBe(false);
    expect(detectConsultantExport(monthlyGrid).ok).toBe(false);
  });
});

describe("the site's workbook (Google Sheet / AppSheet)", () => {
  it("finds the nine sheets by name", () => {
    expect(site.sheets.missing).toEqual([]);
  });
  it("reads the 114 activities (weights adding up to 1.0), 390 villas and the contractors", () => {
    expect(site.activities).toHaveLength(WO22_SITE);
    expect(site.activities.reduce((sum, a) => sum + a.weight, 0)).toBeCloseTo(1, 6);
    expect(site.villas).toHaveLength(WO22_VILLAS);
    expect(site.contractors.map(item => item.name)).toEqual(truth.legacy.contractors);
  });
  it("splits «268 , 270 , 272» into one row per villa, and keeps no e-mail", () => {
    expect(villaList("268 , 270 , 272")).toEqual(["268", "270", "272"]);
    expect(site.log.length).toBe(truth.legacy.logVillaRows - truth.legacy.futureLogRows); // the unknown villa is the database's to refuse
    expect(JSON.stringify(site.log)).not.toContain("@");
  });
  it("refuses a date in the future, with the sheet, the row and the reason", () => {
    const future = site.rejected.filter(item => item.reason === "SITE_DATE_IN_FUTURE");
    expect(future.filter(item => item.sheet === "Progress Log")).toHaveLength(truth.legacy.futureLogRows);
    expect(future.filter(item => item.sheet === "Daily")).toHaveLength(truth.legacy.futureDailyRows);
    expect(future.every(item => item.row > 1 && item.detail! > truth.reportDate)).toBe(true);
  });
  it("reads Progress: 44,460 rows, the current status and the date each status was reached", () => {
    expect(site.progress).toHaveLength(WO22_VILLAS * WO22_SITE);
    const statuses = site.progress.map(item => item.status);
    expect(statuses).toEqual(truth.siteStatus.flat());
    const qc = site.progress.find(item => item.status === "QC_APPROVED")!;
    expect(Object.keys(qc.dates).sort()).toEqual(["DONE", "INSPECTION_REQUESTED", "IN_PROGRESS", "QC_APPROVED"]);
    expect(site.progress.every(item => item.area !== null && item.price !== null)).toBe(true);
  });
  it("Summary Progress agrees with Progress: completed per activity", () => {
    const completed = truth.site.map((_a, i) => truth.siteStatus.filter(row => isSiteDone(row[i])).length);
    expect(site.summary.map(item => item.completed)).toEqual(completed);
  });
  it("reads the planned months (an S that ends at 100%), the daily rows and the labour by WBS code", () => {
    expect(site.plan).toHaveLength(truth.legacy.planMonths);
    expect(site.plan[site.plan.length - 1].cumulativePercent).toBeCloseTo(1, 6);
    expect(site.daily).toHaveLength(truth.legacy.dailyRows - truth.legacy.futureDailyRows);
    expect(site.daily[0]).toMatchObject({ contractor: truth.legacy.contractors[0], mainLabour: 40, equipment: "Excavator", photos: ["photo-0-0.jpg"] });
    expect(site.manpower.every(item => /^DC-\d{2} /.test(item.wbsCode))).toBe(true);
  });
  it("knows the five site statuses by their sheet words", () => {
    expect(["Not Started", "On Progress", "Done", "Request Inspection", "QC Approval"].map(siteStatusOf)).toEqual(["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"]);
    expect(siteStatusOf("Maybe")).toBeNull();
  });
});

describe("matching the site's 114 activities to the catalogue's 128", () => {
  it("suggests every catalogue activity to its one site activity, including the floor splits (one site activity, two catalogue activities)", () => {
    const siteRefs = truth.site.map((activity, i) => ({ id: String(i), name: activity.name, section: activity.csi }));
    const catalogRefs = monthly.activities.map(activity => ({ code: activity.code, name: activity.name, section: activity.divisionName }));
    const { links, unmatchedCatalog, unmatchedSite } = suggestLinks(siteRefs, catalogRefs);
    expect(unmatchedCatalog).toEqual([]); expect(unmatchedSite).toEqual([]);
    expect(links).toHaveLength(WO22_CATALOG);
    const expected = truth.catalog.map((activity, k) => `${activity.site}->${monthly.activities[k].code}`).sort();
    expect(links.map(link => `${link.siteActivityId}->${link.activityCode}`).sort()).toEqual(expected);
    const perSite = new Map<string, number>(); for (const link of links) perSite.set(link.siteActivityId, (perSite.get(link.siteActivityId) ?? 0) + 1);
    expect(Array.from(perSite.values()).filter(count => count === 2)).toHaveLength(14);
  });
  it("scores by significant words: location and «works» do not count", () => {
    expect(nameScore("Plaster walls", "Plaster walls - Ground floor")).toBe(1);
    expect(nameScore("Plaster walls", "Plaster walls works")).toBe(1);
    expect(nameScore("Install footing 1", "Install footing 2")).toBeLessThan(0.75);
  });
});
