import { describe, expect, it } from "vitest";
import { ownerOriginalWeights } from "../testing/ownerWeightsFixtures";
import { parsePmcImportFile, planCatalog, splitMixedName, weightsToCatalogRows, type CatalogContext } from "./pmcImport";

// Q-49: the optional English names of the catalogue — read from «Activity Title» or an English column, split from a mixed group or stage cell, saved
// beside the Arabic name, and re-imported as an update, never a duplicate. Synthetic data only.
const row = (rowNumber: number, cells: Record<string, unknown>) => ({ rowNumber, cells });
const empty = (): CatalogContext => ({ groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map() });
const line = (code: string, name: string, extra: Record<string, unknown> = {}) => ({ modelCode: "A", groupCode: "FIN", groupName: "أعمال التشطيبات Finishes", stageCode: "INT", stageName: "داخلي", activityCode: code, activityName: name, weightPercent: 50, ...extra });

describe("splitMixedName (Q-49)", () => {
  it("POSITIVE: one Arabic run and one English run, either order, with a separator or not", () => {
    expect(splitMixedName("أعمال التشطيبات Finishes")).toEqual({ ar: "أعمال التشطيبات", en: "Finishes" });
    expect(splitMixedName("Finishes - أعمال التشطيبات")).toEqual({ ar: "أعمال التشطيبات", en: "Finishes" });
    expect(splitMixedName("الخرسانة (Concrete Works)")).toEqual({ ar: "الخرسانة", en: "Concrete Works" });
  });

  it("NEGATIVE: one language, a code with Arabic, or the languages interleaved stay whole with no English", () => {
    expect(splitMixedName("أعمال التشطيبات")).toEqual({ ar: "أعمال التشطيبات", en: null });
    expect(splitMixedName("Finishes")).toEqual({ ar: "Finishes", en: null });
    expect(splitMixedName("03 30 00 خرسانة")).toEqual({ ar: "03 30 00 خرسانة", en: null });
    expect(splitMixedName("دهان Paint داخلي Interior")).toEqual({ ar: "دهان Paint داخلي Interior", en: null });
  });
});

describe("planCatalog with English names (Q-49)", () => {
  it("POSITIVE: a new activity carries its English name; a mixed group cell is split and shown", () => {
    const plan = planCatalog([row(2, line("P1", "دهان داخلي", { activityNameEn: "Interior paint" })), row(3, line("P2", "دهان خارجي"))], empty());
    expect(plan.errors).toEqual([]);
    expect(plan.newDefinitions.map(item => [item.code, item.name, item.nameEn])).toEqual([["P1", "دهان داخلي", "Interior paint"], ["P2", "دهان خارجي", null]]);
    expect(plan.newGroups).toEqual([{ code: "FIN", name: "أعمال التشطيبات", nameEn: "Finishes" }]);
    expect(plan.splitNames).toEqual([{ original: "أعمال التشطيبات Finishes", ar: "أعمال التشطيبات", en: "Finishes" }]);
  });

  const stored = (): CatalogContext => ({
    ...empty(),
    groups: new Map([["FIN", { id: "g1", nameEn: "Finishes" }]]),
    stages: new Map([["INT", { id: "s1", groupCode: "FIN", nameEn: null }]]),
    definitions: new Map([["A\u0000P1", { id: "d1", weightPercent: 50, groupCode: "FIN", stageCode: "INT", name: "دهان داخلي", wbsItemId: null, nameEn: "Interior paint" }], ["A\u0000P2", { id: "d2", weightPercent: 50, groupCode: "FIN", stageCode: "INT", name: "دهان خارجي", wbsItemId: null, nameEn: null }]]),
    activityCodesByModel: new Map([["A", new Set(["P1", "P2"])]]),
  });

  it("NEGATIVE: the same file again changes nothing, and a file with no English column keeps the stored English names (an empty cell never erases)", () => {
    const again = planCatalog([row(2, line("P1", "دهان داخلي", { activityNameEn: "Interior paint" })), row(3, line("P2", "دهان خارجي"))], stored());
    expect(again.counts).toEqual({ create: 0, update: 0, unchanged: 2 });
    const noColumn = planCatalog([row(2, line("P1", "دهان داخلي", { groupName: "أعمال التشطيبات" })), row(3, line("P2", "دهان خارجي", { groupName: "أعمال التشطيبات" }))], stored());
    expect(noColumn.counts).toEqual({ create: 0, update: 0, unchanged: 2 });
    expect(noColumn.updatedGroupNames).toEqual([]);
  });

  it("POSITIVE: a new English name for an existing activity, group or stage is an update — no duplicate activity", () => {
    const plan = planCatalog([row(2, line("P1", "دهان داخلي", { activityNameEn: "Interior painting", stageNameEn: "Interior" })), row(3, line("P2", "دهان خارجي", { activityNameEn: "Exterior paint" }))], stored());
    expect(plan.errors).toEqual([]);
    expect(plan.newDefinitions).toEqual([]);
    expect(plan.updatedDefinitions.map(item => [item.id, item.nameEn])).toEqual([["d1", "Interior painting"], ["d2", "Exterior paint"]]);
    expect(plan.updatedStageNames).toEqual([{ id: "s1", nameEn: "Interior" }]);
    expect(plan.updatedGroupNames).toEqual([]); // the stored «Finishes» is what the mixed cell says
    expect(plan.counts).toEqual({ create: 0, update: 3, unchanged: 0 });
  });
});

describe("the owner's «Activity Title» (Q-48 shape a)", () => {
  it("POSITIVE: each activity keeps its Arabic name and gains the English one from «Activity Title»", async () => {
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await ownerOriginalWeights() });
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    const plan = planCatalog(out.rows, empty());
    expect(plan.newDefinitions.map(item => [item.code, item.name, item.nameEn])).toEqual([
      ["WIR.3.1.1", "صب القواعد", "Footings"], ["WIR.3.1.2", "صب الأعمدة", "Columns"], ["WIR.3.1.3", "صب السقف", "Slab"], ["WIR.9.1.1", "دهان داخلي", "Interior paint"], ["WIR.9.1.2", "دهان خارجي", "Exterior paint"],
    ]);
  });
});
