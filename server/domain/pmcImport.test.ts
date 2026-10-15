import { describe, expect, it } from "vitest";
import { buildSpreadsheet } from "./excelWorkbook";
import { parsePmcImportFile, parsePmcStatus, parseUnitList, pmcDefinitionKey, planBaseline, planCatalog, planLocations, planRequests, planStatus, type ParsedRow } from "./pmcImport";

const rows = (...cells: Array<Record<string, unknown>>): ParsedRow[] => cells.map((cell, index) => ({ rowNumber: index + 2, cells: cell }));
const codes = (errors: Array<{ code: string }>) => errors.map(error => error.code);

describe("PMC import: reading files", () => {
  const csv = (text: string) => Buffer.from(text, "utf8");

  it("accepts Arabic or English headers and maps them to fields", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "csv", bytes: csv("المنطقة,البلوك,رقم الوحدة,النموذج\nZ1,B1,7,A\n") });
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([{ rowNumber: 2, cells: expect.objectContaining({ zoneCode: "Z1", blockCode: "B1", unitNumber: "7", modelCode: "A" }) }]);
  });

  it("reads an Excel file written by the platform's own spreadsheet builder", async () => {
    const bytes = await buildSpreadsheet({ sheetName: "status", headers: ["Unit", "Activity", "Status"], rows: [[1, "WALLS", "Complete"]], format: "xlsx" });
    const parsed = await parsePmcImportFile({ kind: "status", format: "xlsx", bytes });
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].cells).toMatchObject({ activityCode: "WALLS", status: "Complete" });
  });

  it("rejects a missing required column, an unknown column and an unreadable file before any row is read", async () => {
    expect(codes((await parsePmcImportFile({ kind: "status", format: "csv", bytes: csv("Unit,Status\n1,Complete\n") })).errors)).toEqual(["IMPORT_REQUIRED_COLUMN_MISSING"]);
    expect(codes((await parsePmcImportFile({ kind: "status", format: "csv", bytes: csv("Unit,Activity,Status,Colour\n1,W,Complete,red\n") })).errors)).toEqual(["IMPORT_UNSUPPORTED_COLUMN"]);
    expect(codes((await parsePmcImportFile({ kind: "status", format: "xlsx", bytes: csv("not a workbook") })).errors)).toEqual(["IMPORT_WORKBOOK_INVALID"]);
  });

  it("understands status words in both languages and refuses others", () => {
    expect(["Complete", "مكتمل", "in progress", "قيد المراجعة", "NOT_STARTED"].map(parsePmcStatus)).toEqual(["COMPLETE", "COMPLETE", "IN_PROGRESS", "UNDER_REVIEW", "NOT_STARTED"]);
    expect(parsePmcStatus("done-ish")).toBeUndefined();
  });

  it("expands unit lists and refuses a reversed range instead of swapping it (rule 6)", () => {
    expect(parseUnitList("1-3, 7, 5-6")).toEqual({ units: [1, 2, 3, 5, 6, 7] });
    expect(parseUnitList("147-8")).toEqual({ units: [], error: "PMC_UNIT_RANGE_INVALID" });
    expect(parseUnitList("12, x")).toEqual({ units: [], error: "PMC_UNIT_LIST_INVALID" });
    expect(parseUnitList("")).toEqual({ units: [], error: "PMC_UNIT_LIST_INVALID" });
  });
});

describe("PMC import: locations", () => {
  const empty = { zones: new Map(), blocks: new Map(), units: new Map() };
  const file = rows(
    { zoneCode: "Z1", zoneName: "Zone 1", blockCode: "B1", unitNumber: "1", modelCode: "A" },
    { zoneCode: "Z1", blockCode: "B1", unitNumber: "2", modelCode: "A", saleStatus: "sold", unitWeight: "2" },
    { zoneCode: "Z2", blockCode: "B2", unitNumber: "3", modelCode: "B" },
  );

  it("plans zones, blocks and units to create, defaulting names and weights", () => {
    const plan = planLocations(file, empty);
    expect(plan.errors).toEqual([]);
    expect(plan.newZones).toEqual([{ code: "Z1", name: "Zone 1" }, { code: "Z2", name: "Z2" }]);
    expect(plan.newBlocks).toEqual([{ code: "B1", name: "B1", zoneCode: "Z1" }, { code: "B2", name: "B2", zoneCode: "Z2" }]);
    expect(plan.newUnits.map(unit => [unit.unitNumber, unit.unitWeight, unit.saleStatus])).toEqual([[1, 1, null], [2, 2, "sold"], [3, 1, null]]);
    expect(plan.counts).toEqual({ create: 3, update: 0, unchanged: 0 });
  });

  it("is a no-op when the same file is imported again, and updates only what may change", () => {
    const stored = { zones: new Map([["Z1", { id: "z1" }], ["Z2", { id: "z2" }]]), blocks: new Map([["B1", { id: "b1", zoneCode: "Z1" }], ["B2", { id: "b2", zoneCode: "Z2" }]]), units: new Map([[1, { id: "u1", blockCode: "B1", modelCode: "A", saleStatus: null, unitWeight: 1 }], [2, { id: "u2", blockCode: "B1", modelCode: "A", saleStatus: "sold", unitWeight: 2 }], [3, { id: "u3", blockCode: "B2", modelCode: "B", saleStatus: null, unitWeight: 1 }]]) };
    expect(planLocations(file, stored).counts).toEqual({ create: 0, update: 0, unchanged: 3 });
    const changed = planLocations(rows({ zoneCode: "Z1", blockCode: "B1", unitNumber: "1", modelCode: "A", saleStatus: "reserved" }), stored);
    expect(changed.updatedUnits).toEqual([{ id: "u1", unitNumber: 1, saleStatus: "reserved", unitWeight: 1 }]);
  });

  it("rejects duplicates, a block in two zones, a model or block change on an existing unit, and bad numbers", () => {
    const stored = { ...empty, units: new Map([[5, { id: "u5", blockCode: "B1", modelCode: "A", saleStatus: null, unitWeight: 1 }], [6, { id: "u6", blockCode: "B1", modelCode: "A", saleStatus: null, unitWeight: 1 }]]) };
    const plan = planLocations(rows(
      { zoneCode: "Z1", blockCode: "B1", unitNumber: "1", modelCode: "A" },
      { zoneCode: "Z1", blockCode: "B1", unitNumber: "1", modelCode: "A" },
      { zoneCode: "Z2", blockCode: "B1", unitNumber: "2", modelCode: "A" },
      { zoneCode: "Z1", blockCode: "B1", unitNumber: "5", modelCode: "C" },
      { zoneCode: "Z1", blockCode: "B3", unitNumber: "6", modelCode: "A" },
      { zoneCode: "Z1", blockCode: "B1", unitNumber: "x", modelCode: "A" },
      { zoneCode: "Z1", blockCode: "B1", unitNumber: "9", modelCode: "" },
    ), stored);
    expect(codes(plan.errors)).toEqual(["IMPORT_DUPLICATE_FILE_KEY", "PMC_BLOCK_ZONE_CONFLICT", "PMC_UNIT_MODEL_CHANGE_BLOCKED", "PMC_UNIT_BLOCK_CHANGE_BLOCKED", "IMPORT_INVALID_NUMBER", "IMPORT_REQUIRED_VALUE_MISSING"]);
    expect(plan.errors.map(error => error.rowNumber)).toEqual([3, 4, 5, 6, 7, 8]);
  });
});

describe("PMC import: catalogue and weights", () => {
  const context = { groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map([["WBS-1", "wbs-id"]]) };
  const model = (modelCode: string, weights: number[]) => weights.map((weightPercent, index) => ({ modelCode, groupCode: "FIN", stageCode: "INT", activityCode: `ACT${index + 1}`, activityName: `Activity ${index + 1}`, weightPercent: String(weightPercent) }));

  it("accepts models whose weights total exactly 100 and plans groups, stages and activities", () => {
    const plan = planCatalog(rows(...model("A", [60, 40]), ...model("B", [33.3333, 33.3333, 33.3334])), context);
    expect(plan.errors).toEqual([]);
    expect(plan.models).toEqual([{ modelCode: "A", activities: 2, totalWeight: 100 }, { modelCode: "B", activities: 3, totalWeight: 100 }]);
    expect(plan.newGroups).toEqual([{ code: "FIN", name: "FIN" }]);
    expect(plan.newStages).toEqual([{ code: "INT", name: "INT", groupCode: "FIN" }]);
    expect(plan.counts.create).toBe(5);
  });

  it("names the model whose weights do not total 100 and plans nothing for it (rule 4)", () => {
    const plan = planCatalog(rows(...model("A", [60, 40]), ...model("B", [50, 30])), context);
    expect(plan.errors).toEqual([{ rowNumber: 0, code: "PMC_MODEL_WEIGHTS_NOT_100", field: "B", detail: "B totals 80" }]);
    expect(plan.newDefinitions.map(definition => definition.modelCode)).toEqual(["A", "A"]);
  });

  it("refuses a blank group, stage or activity, duplicates, a stage under two groups and an unknown WBS (rule 5)", () => {
    const plan = planCatalog(rows(
      { modelCode: "A", groupCode: "", stageCode: "INT", activityCode: "X", activityName: "x", weightPercent: "100" },
      { modelCode: "A", groupCode: "FIN", stageCode: "INT", activityCode: "ACT1", activityName: "a", weightPercent: "50" },
      { modelCode: "A", groupCode: "FIN", stageCode: "INT", activityCode: "ACT1", activityName: "a", weightPercent: "50" },
      { modelCode: "A", groupCode: "ELEC", stageCode: "INT", activityCode: "ACT2", activityName: "b", weightPercent: "50" },
      { modelCode: "A", groupCode: "FIN", stageCode: "EXT", activityCode: "ACT3", activityName: "c", weightPercent: "50", wbsCode: "NOPE" },
      { modelCode: "A", groupCode: "FIN", stageCode: "EXT", activityCode: "ACT4", activityName: "d", weightPercent: "101" },
    ), context);
    expect(codes(plan.errors)).toEqual(["PMC_CLASSIFICATION_BLANK", "PMC_DUPLICATE_ACTIVITY", "PMC_STAGE_GROUP_CONFLICT", "PMC_WBS_REFERENCE_UNRESOLVED", "IMPORT_INVALID_NUMBER"]);
  });

  it("is a no-op when re-imported, updates changed weights, and will not silently drop an existing activity", () => {
    const stored = { ...context, groups: new Map([["FIN", { id: "g" }]]), stages: new Map([["INT", { id: "s", groupCode: "FIN" }]]), activityCodesByModel: new Map([["A", new Set(["ACT1", "ACT2"])]]), definitions: new Map([[pmcDefinitionKey("A", "ACT1"), { id: "d1", weightPercent: 60, groupCode: "FIN", stageCode: "INT", name: "Activity 1", wbsItemId: null }], [pmcDefinitionKey("A", "ACT2"), { id: "d2", weightPercent: 40, groupCode: "FIN", stageCode: "INT", name: "Activity 2", wbsItemId: null }]]) };
    expect(planCatalog(rows(...model("A", [60, 40])), stored).counts).toEqual({ create: 0, update: 0, unchanged: 2 });
    const reweighted = planCatalog(rows(...model("A", [70, 30])), stored);
    expect(reweighted.updatedDefinitions.map(definition => [definition.id, definition.weightPercent])).toEqual([["d1", 70], ["d2", 30]]);
    const dropped = planCatalog(rows(model("A", [100])[0]), stored);
    expect(codes(dropped.errors)).toEqual(["PMC_MODEL_ACTIVITY_OMITTED"]);
  });
});

describe("PMC import: status of each unit-activity cell", () => {
  const context = {
    units: new Map([[1, { id: "u1", modelCode: "A" }], [2, { id: "u2", modelCode: "B" }]]),
    definitions: new Map([["A", new Map([["WALLS", "dA"]])], ["B", new Map([["TILES", "dB"]])]]),
    allActivityCodes: new Set(["WALLS", "TILES"]),
    verificationStatuses: new Map([["PAID", "v-paid"]]),
    engineers: new Map([["eng@example.test", 7]]),
    cells: new Map<string, { id: string; status: "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE"; verificationStatusId: string | null }>(),
  };

  it("plans a new cell, reading Arabic status words, engineer and date", () => {
    const plan = planStatus(rows({ unitNumber: "1", activityCode: "WALLS", status: "مكتمل", verificationStatus: "PAID", engineerEmail: "ENG@example.test", changedAt: "2026-09-01" }), context);
    expect(plan.errors).toEqual([]);
    expect(plan.operations).toEqual([{ unitId: "u1", unitNumber: 1, activityDefinitionId: "dA", status: "COMPLETE", verificationStatusId: "v-paid", engineerUserId: 7, changedAt: new Date("2026-09-01T00:00:00.000Z"), existing: null }]);
  });

  it("is a no-op for an unchanged cell, keeps a stored verification status when the column is blank, updates on change", () => {
    const stored = { ...context, cells: new Map([["u1:dA", { id: "p1", status: "IN_PROGRESS" as const, verificationStatusId: "v-paid" }]]) };
    expect(planStatus(rows({ unitNumber: "1", activityCode: "WALLS", status: "IN_PROGRESS" }), stored).counts).toEqual({ create: 0, update: 0, unchanged: 1 });
    const moved = planStatus(rows({ unitNumber: "1", activityCode: "WALLS", status: "COMPLETE" }), stored);
    expect(moved.operations).toEqual([expect.objectContaining({ status: "COMPLETE", verificationStatusId: "v-paid", existing: { id: "p1", status: "IN_PROGRESS" } })]);
  });

  it("rejects each kind of bad row with its own reason", () => {
    const plan = planStatus(rows(
      { unitNumber: "99", activityCode: "WALLS", status: "Complete" },
      { unitNumber: "1", activityCode: "TILES", status: "Complete" },
      { unitNumber: "1", activityCode: "NOPE", status: "Complete" },
      { unitNumber: "1", activityCode: "WALLS", status: "finished-ish" },
      { unitNumber: "1", activityCode: "WALLS", status: "Complete", verificationStatus: "UNKNOWN" },
      { unitNumber: "1", activityCode: "WALLS", status: "Complete", engineerEmail: "stranger@example.test" },
      { unitNumber: "1", activityCode: "WALLS", status: "Complete", changedAt: "yesterday-ish" },
      { unitNumber: "1", activityCode: "WALLS", status: "Complete" },
      { unitNumber: "1", activityCode: "WALLS", status: "In Progress" },
    ), context);
    expect(codes(plan.errors)).toEqual(["PMC_UNIT_NOT_FOUND", "PMC_ACTIVITY_NOT_IN_UNIT_MODEL", "PMC_ACTIVITY_NOT_FOUND", "PMC_STATUS_INVALID", "PMC_VERIFICATION_STATUS_UNKNOWN", "PMC_ENGINEER_NOT_A_MEMBER", "PMC_DATE_INVALID", "IMPORT_DUPLICATE_FILE_KEY"]);
    expect(plan.operations).toHaveLength(1);
  });
});

describe("PMC import: inspection requests", () => {
  const context = {
    units: new Map([[1, { id: "u1", modelCode: "A" }], [2, { id: "u2", modelCode: "A" }], [3, { id: "u3", modelCode: "B" }]]),
    definitions: new Map([["A", new Map([["WALLS", "dA"]])], ["B", new Map([["WALLS", "dB"]])]]),
    allActivityCodes: new Set(["WALLS"]),
    requests: new Map([["IR-OLD", { id: "r-old", responseCode: null as string | null }], ["IR-DONE", { id: "r-done", responseCode: "A" }]]),
  };
  const base = { activityCode: "WALLS", requestedAt: "2026-10-01" };

  it("creates a request over a unit range with its reply, and resolves the activity in the units' model", () => {
    const plan = planRequests(rows({ ...base, requestCode: "IR-1", unitNumbers: "1-2", consultant: "Consultant X", responseCode: "b" }), context);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([expect.objectContaining({ requestCode: "IR-1", activityDefinitionId: "dA", unitIds: ["u1", "u2"], consultantLabel: "Consultant X", responseCode: "B" })]);
  });

  it("never rewrites a stored request: it only supplies a reply that was still missing", () => {
    const plan = planRequests(rows({ ...base, requestCode: "IR-OLD", unitNumbers: "1", responseCode: "C" }, { ...base, requestCode: "IR-DONE", unitNumbers: "1", responseCode: "B" }), context);
    expect(plan.replies).toEqual([{ id: "r-old", requestCode: "IR-OLD", responseCode: "C" }]);
    expect(plan.counts).toEqual({ create: 0, update: 1, unchanged: 1 });
  });

  it("rejects mixed models, unknown units, a reversed range, a bad reply and duplicate request codes", () => {
    const plan = planRequests(rows(
      { ...base, requestCode: "IR-2", unitNumbers: "1, 3" },
      { ...base, requestCode: "IR-3", unitNumbers: "1, 77" },
      { ...base, requestCode: "IR-4", unitNumbers: "9-1" },
      { ...base, requestCode: "IR-5", unitNumbers: "1", responseCode: "Z" },
      { ...base, requestCode: "IR-6", unitNumbers: "1" },
      { ...base, requestCode: "IR-6", unitNumbers: "2" },
      { ...base, requestCode: "IR-7", unitNumbers: "1", requestedAt: "soon" },
    ), context);
    expect(codes(plan.errors)).toEqual(["PMC_REQUEST_MIXED_MODELS", "PMC_UNIT_NOT_FOUND", "PMC_UNIT_RANGE_INVALID", "PMC_RESPONSE_CODE_INVALID", "IMPORT_DUPLICATE_FILE_KEY", "PMC_DATE_INVALID"]);
    expect(plan.creates.map(create => create.requestCode)).toEqual(["IR-6"]);
  });
});

describe("PMC import: baseline", () => {
  const context = { definitions: new Map([[pmcDefinitionKey("A", "WALLS"), "dA"]]), stored: new Map([["dA", new Map([["2026-01-01T00:00:00.000Z", { id: "b1", plannedPercent: 10 }]])]]) };

  it("plans new months, normalises each date to its month, and leaves an unchanged month alone", () => {
    const plan = planBaseline(rows({ modelCode: "A", activityCode: "WALLS", period: "2026-01-15", plannedPercent: "10" }, { modelCode: "A", activityCode: "WALLS", period: "2026-02-20", plannedPercent: "30%" }), context);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([{ activityDefinitionId: "dA", periodAt: new Date("2026-02-01T00:00:00.000Z"), plannedPercent: 30 }]);
    expect(plan.counts).toEqual({ create: 1, update: 0, unchanged: 1 });
  });

  it("requires the plan to be cumulative, including against months already stored", () => {
    const plan = planBaseline(rows({ modelCode: "A", activityCode: "WALLS", period: "2026-02-01", plannedPercent: "5" }), context);
    expect(codes(plan.errors)).toEqual(["PMC_BASELINE_NOT_CUMULATIVE"]);
    expect(plan.creates).toEqual([]);
  });

  it("rejects an unknown activity, a percentage above 100, an unreadable month and a repeated month", () => {
    const plan = planBaseline(rows(
      { modelCode: "A", activityCode: "NOPE", period: "2026-03-01", plannedPercent: "50" },
      { modelCode: "A", activityCode: "WALLS", period: "2026-03-01", plannedPercent: "150" },
      { modelCode: "A", activityCode: "WALLS", period: "later", plannedPercent: "50" },
      { modelCode: "A", activityCode: "WALLS", period: "2026-04-01", plannedPercent: "50" },
      { modelCode: "A", activityCode: "WALLS", period: "2026-04-20", plannedPercent: "60" },
    ), context);
    expect(codes(plan.errors)).toEqual(["PMC_ACTIVITY_NOT_FOUND", "IMPORT_INVALID_NUMBER", "PMC_DATE_INVALID", "IMPORT_DUPLICATE_FILE_KEY"]);
  });
});
