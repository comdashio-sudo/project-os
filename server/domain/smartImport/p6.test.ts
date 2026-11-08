import { describe, expect, it } from "vitest";
import { buildP6Xer, P6_COUNTS } from "./p6Fixture";
import { isXerText, p6Date, parseXerFile, plannedCostByActivity, readP6 } from "./p6Xer";

describe("P6 XER read whole (synthetic, with the table sizes of the owner's real export)", () => {
  const built = buildP6Xer();
  const file = parseXerFile(built.bytes);
  const model = readP6(file);

  it("is recognised as an XER and its header currency is read (P6 writes USD by default)", () => {
    expect(isXerText(built.bytes)).toBe(true);
    expect(model.header).toMatchObject({ version: "25.12", currency: "USD", encoding: "utf-8" });
  });
  it("keeps everything: 611 activities, 140 WBS, 1,434 relationships, 1,022 assignments, 377 code assignments, 6 resources, 3 calendars", () => {
    expect(model.activities.length).toBe(P6_COUNTS.activities);
    expect(model.wbs.length).toBe(P6_COUNTS.wbs);
    expect(model.relationships.length).toBe(P6_COUNTS.relationships);
    expect(model.assignments.length).toBe(P6_COUNTS.assignments);
    expect(model.codeAssignments.length).toBe(P6_COUNTS.codeAssignments);
    expect(model.resources.length).toBe(P6_COUNTS.resources);
    expect(model.calendars.length).toBe(P6_COUNTS.calendars);
    expect(model.codeTypes.length).toBe(2); expect(model.codeValues.length).toBe(10);
    expect(model.issues).toEqual([]);
  });
  it("keeps the WBS tree and gives repeated short names a path code (one code per project)", () => {
    expect(model.wbs.filter(w => w.isProjectRoot).length).toBe(1);
    expect(model.wbs.filter(w => w.parentExternalId === null).length).toBe(1);
    expect(new Set(model.wbs.map(w => w.code)).size).toBe(P6_COUNTS.wbs);
    expect(model.wbs.some(w => /^B\d\.\d+$/.test(w.code))).toBe(true); // "1" under branch B3 is «B3.1»
  });
  it("resolves relationships to activity codes with their type and lag; types of resources; planned cost from the assignments", () => {
    expect(new Set(model.relationships.map(r => r.type))).toEqual(new Set(["FS", "SS", "FF", "SF"]));
    expect(model.relationships.every(r => model.activities.some(a => a.code === r.predecessorCode))).toBe(true);
    expect(model.resources.map(r => r.type)).toEqual(["labor", "labor", "equipment", "equipment", "material", "material"]);
    const cost = plannedCostByActivity(model);
    expect(Array.from(cost.values()).reduce((a, b) => a + b, 0)).toBe(built.truth.totalPlannedCost);
  });
  it("reads dates in P6's «2023-10-19 08:00» and in an Excel export's «19-Oct-23»; a Windows-1252 file keeps its letters", () => {
    expect(p6Date("2023-10-19 08:00")).toBe("2023-10-19T08:00:00");
    expect(p6Date("19-Oct-23")).toBe("2023-10-19T00:00:00");
    expect(p6Date("19-Oct-2023 A")).toBe("2023-10-19T00:00:00");
    expect(p6Date("")).toBeNull();
    const latin = readP6(parseXerFile(buildP6Xer({ latin1: true }).bytes));
    expect(latin.header.encoding).toBe("windows-1252");
    expect(latin.activities[0].name).toContain("café");
  });
  it("says which tables it did not keep (never silently): the currency table and the OBS", () => {
    expect(model.skippedTables.map(t => t.table).sort()).toEqual(["CURRTYPE", "OBS"]);
  });
  it("refuses what cannot be imported: two projects in one file, a duplicate activity code", () => {
    const text = new TextDecoder().decode(built.bytes).replace("%R\t6001\t500", "%R\t6001\t501");
    expect(readP6(parseXerFile(new TextEncoder().encode(text))).issues.map(i => i.code)).toContain("XER_MULTIPLE_PROJECTS");
    const dup = new TextDecoder().decode(built.bytes).replace("A1010", "A1000");
    expect(readP6(parseXerFile(new TextEncoder().encode(dup))).issues.map(i => i.code)).toContain("XER_ACTIVITY_CODE_DUPLICATE");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectScheduleUpdate, updateDate } from "./scheduleUpdate";
import { readGrid } from "./sheetReader";
import { detectFormat, understand } from "./understand";
import { isOle2, readXls } from "./xlsReader";

describe("the legacy .xls format (BIFF8) and the P6 «update activities» export", () => {
  const bytes = new Uint8Array(readFileSync(join(__dirname, "..", "..", "testing", "fixtures", "p6-activity-update.xls")));
  it("is accepted: recognised as the legacy container and read, every sheet, with text, numbers and dates", async () => {
    expect(isOle2(bytes)).toBe(true);
    expect(detectFormat(bytes, "update.xls")).toBe("xls");
    const read = readXls(bytes);
    if (!read.ok) throw new Error(read.code);
    expect(read.sheets.map(s => s.name)).toEqual(["TASK", "USERDATA"]);
    expect(read.sheets[0].rows.length).toBe(616);
    expect(read.sheets[0].rows[1]).toEqual(["A1000", "Activity 1", "02-Oct-23", "14-Oct-23"]);
    const user = read.sheets[1].rows[1];
    expect(user[1]).toBe(42.5); expect(user[2]).toBeInstanceOf(Date); expect((user[2] as Date).toISOString().slice(0, 10)).toBe("2023-10-19"); // a date by its number format
    expect((await readGrid(bytes, "xls")).ok).toBe(true);
  });
  it("is refused with a code when it is not a readable workbook: not OLE2, damaged, or a truncated file", () => {
    expect(readXls(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).ok).toBe(false);
    const cut = readXls(bytes.subarray(0, 700));
    expect(cut.ok).toBe(false);
    const garbled = new Uint8Array(bytes); for (let i = 600; i < 1200; i++) garbled[i] = 0xff;
    expect(readXls(garbled).ok).toBe(false);
  });
  it("is recognised as a progress update by its headers (the star means an actual date) and the other sheet is ignored", async () => {
    const grid = await readGrid(bytes, "xls");
    if (!grid.ok) throw new Error(grid.code);
    const detected = detectScheduleUpdate(grid.sheets);
    if (!detected.ok) throw new Error(detected.reason);
    expect(detected.model).toMatchObject({ sheet: "TASK", headerRow: 1, ignoredSheets: ["USERDATA"] });
    expect(detected.model.rows.length).toBe(615);
    expect(detected.model.rows.filter(r => r.actualStart).length).toBe(143); // 139 + the 4 ids that are not in the schedule
    expect(detected.model.rows.filter(r => r.actualFinish).length).toBe(120);
    expect(detected.model.rows[0]).toMatchObject({ code: "A1000", actualStart: "2023-10-02", actualFinish: "2023-10-14" });
    const understood = await understand(bytes, { fileName: "update-activities.xls" });
    expect(understood).toMatchObject({ format: "xls", kind: "scheduleUpdate", sheet: "TASK" });
  });
  it("reads the dates of an update: «19-Oct-23», with a star or an A, a real date, blank = none, junk = reported", () => {
    expect(updateDate("19-Oct-23")).toEqual({ iso: "2023-10-19", bad: false });
    expect(updateDate("19-Oct-23 A")).toEqual({ iso: "2023-10-19", bad: false });
    expect(updateDate("*19-Oct-23")).toEqual({ iso: "2023-10-19", bad: false });
    expect(updateDate(new Date(Date.UTC(2023, 9, 19)))).toEqual({ iso: "2023-10-19", bad: false });
    expect(updateDate(null)).toEqual({ iso: null, bad: false });
    expect(updateDate("soon")).toEqual({ iso: null, bad: true });
  });
  it("does not take a plain table for an update (no star headers) nor the other synthetic samples", async () => {
    const { buildSamples } = await import("./fixtures");
    for (const sample of (await buildSamples()).filter(s => s.format === "xlsx")) { const grid = await readGrid(sample.bytes, "xlsx"); if (grid.ok) expect(detectScheduleUpdate(grid.sheets).ok, sample.id).toBe(false); }
  });
});
