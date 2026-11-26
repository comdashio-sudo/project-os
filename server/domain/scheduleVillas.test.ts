import { describe, expect, it } from "vitest";
import { linkScheduleToVillas, villaNumberFromActivityCode, villaNumberFromName } from "./scheduleVillas";

// Q-61 (2): which villa a P6 activity belongs to, and where the schedule and the project's villas disagree. Synthetic codes only.
describe("linking a P6 schedule to the project's villas (Q-61 (2))", () => {
  it("reads a villa number from a WBS short name or path, and from an activity code's prefix; nothing else", () => {
    expect(["V606", "v606", "Villa 606", "VILLA-606", "PH1.B25.V606", "V0606"].map(villaNumberFromName)).toEqual([606, 606, 606, 606, 606, 606]);
    expect(["B25", "PH1", "Villas", "V", "V606A", "Q02"].map(villaNumberFromName)).toEqual([null, null, null, null, null, null]);
    expect(["V606.Q02", "V606-Q02", "v606_q02", "Villa 606.Q02"].map(villaNumberFromActivityCode)).toEqual([606, 606, 606, 606]);
    expect(["Q02.V606", "A1000", "V606"].map(villaNumberFromActivityCode)).toEqual([null, null, null]);
  });

  const wbs = [
    { id: "w0", parentId: null, code: "CN", name: "Construction" }, { id: "w1", parentId: "w0", code: "PH1", name: "Phase 1" },
    { id: "w2", parentId: "w1", code: "B25", name: "Block 25" }, { id: "w3", parentId: "w2", code: "V606", name: "Villa 606" }, { id: "w4", parentId: "w2", code: "V607", name: "Villa 607" },
    { id: "w5", parentId: "w1", code: "B26", name: "Block 26" }, { id: "w6", parentId: "w5", code: "PH1.B26.V701", name: "Villa 701" },
  ];
  const act = (id: string, code: string, wbsItemId: string | null, codes: Record<string, string>) => ({ id, code, name: code, wbsItemId, codes });
  const activities = [
    act("a1", "V606.Q02", "w3", { "Villa Type": "type C", Block: "B25", "Q Item": "Q02" }), act("a2", "V606.Q06", "w3", { "Villa Type": "type C", Block: "B25", "Q Item": "Q06" }),
    act("a3", "V607.Q02", "w4", { "Villa Type": "type D", Block: "B25", "Q Item": "Q02" }), // the project says 607 is C: a model mismatch
    act("a4", "X-1", "w6", { "Villa Type": "C", Block: "BLK 26", "Q Item": "Q02" }), // villa from the WBS path, though the code has no prefix
    act("a5", "V999.Q02", null, { "Villa Type": "C", "Q Item": "Q02" }), // villa from the code prefix only; the project has no 999
    act("a6", "MOB-01", "w1", { Stage: "SUB" }), // mobilisation: no villa
  ];
  const villas = [{ unitNumber: 606, modelCode: "C", blockCode: "25" }, { unitNumber: 607, modelCode: "C", blockCode: "25" }, { unitNumber: 701, modelCode: "C", blockCode: "26" }, { unitNumber: 702, modelCode: "D", blockCode: "26" }];

  it("POSITIVE: each activity goes to its villa (WBS first, then the code), with the villa's Q items; «type C» = C and «BLK 26» = 26", () => {
    const links = linkScheduleToVillas({ wbs, activities, villas });
    expect(links).toMatchObject({ activities: 6, linkedActivities: 5, unlinkedActivities: 1, villasInSchedule: 4, villasMatched: 3 });
    expect(links.villas).toEqual([
      { unitNumber: 606, activities: 2, inProject: true, qItems: ["Q02", "Q06"] }, { unitNumber: 607, activities: 1, inProject: true, qItems: ["Q02"] },
      { unitNumber: 701, activities: 1, inProject: true, qItems: ["Q02"] }, { unitNumber: 999, activities: 1, inProject: false, qItems: ["Q02"] },
    ]);
  });

  it("NEGATIVE: the differences are reported, never settled — a model that differs, a villa the project lacks, a villa no activity names", () => {
    const links = linkScheduleToVillas({ wbs, activities, villas });
    expect(links.mismatches).toEqual([{ unitNumber: 607, field: "model", schedule: "type D", project: "C", activities: 1 }]);
    expect(links.missingInProject).toEqual([999]);
    expect(links.withoutActivities).toEqual([702]);
  });

  it("a block that differs is reported; one stray activity does not outvote the villa's others", () => {
    const stray = [...activities, act("a7", "V606.Q07", "w3", { "Villa Type": "type D", Block: "B26", "Q Item": "Q07" }), act("a8", "V606.Q08", "w3", { "Villa Type": "type C", Block: "B26", "Q Item": "Q08" }), act("a9", "V606.Q09", "w3", { Block: "B26" })];
    const links = linkScheduleToVillas({ wbs, activities: stray, villas });
    expect(links.mismatches.filter(row => row.unitNumber === 606)).toEqual([{ unitNumber: 606, field: "block", schedule: "B26", project: "25", activities: 5 }]); // 3 of 5 say B26; 3 of 4 say C
  });

  it("review of #549: a broad code name («Type», «Item») is read only without the explicit one; a tie that includes the project's value is not a difference", () => {
    const v = [{ unitNumber: 801, modelCode: "C", blockCode: "30" }];
    const w = [{ id: "r", parentId: null, code: "V801", name: "Villa 801" }];
    // «Villa Type» C wins over a «Type» D on the same activity; «Q Item» Q02 wins over «Item» X
    const both = linkScheduleToVillas({ wbs: w, villas: v, activities: [act("b1", "V801.010", "r", { "Villa Type": "type C", Type: "D", "Q Item": "Q02", Item: "X" })] });
    expect(both.mismatches).toEqual([]);
    expect(both.villas[0].qItems).toEqual(["Q02"]);
    // only the broad name present: it is read
    const broad = linkScheduleToVillas({ wbs: w, villas: v, activities: [act("b2", "V801.010", "r", { Type: "D", Item: "Q06" })] });
    expect(broad.mismatches).toEqual([{ unitNumber: 801, field: "model", schedule: "D", project: "C", activities: 1 }]);
    expect(broad.villas[0].qItems).toEqual(["Q06"]);
    // one says C, one says D: a tie with the project's own C is not reported
    const tie = linkScheduleToVillas({ wbs: w, villas: v, activities: [act("b3", "V801.010", "r", { "Villa Type": "D" }), act("b4", "V801.020", "r", { "Villa Type": "C" })] });
    expect(tie.mismatches).toEqual([]);
  });
});

