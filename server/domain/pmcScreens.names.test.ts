import { describe, expect, it } from "vitest";
import { activitiesMatrix, datasetHasEnglishNames, stagesView, withActivityNames, type PmcDataset } from "./pmcScreens";

// Q-49: the PMC screens with the activity names in the chosen language — display only, the same numbers in both. Synthetic data only.
const at = new Date("2026-10-15T00:00:00.000Z");
const base: PmcDataset = {
  now: at, factors: { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 },
  units: [{ id: "u1", number: 1, modelCode: "A", weight: 1, zoneCode: "Z1", blockCode: "B1" }, { id: "u2", number: 2, modelCode: "A", weight: 1, zoneCode: "Z1", blockCode: "B1" }],
  definitions: [
    { id: "d1", modelCode: "A", code: "FOOT", name: "صب القواعد", nameEn: "Footings", weightPercent: 60, groupCode: "CIV", groupName: "خرسانة", groupNameEn: "Concrete", stageCode: "STR", stageName: "هيكل", stageNameEn: null },
    { id: "d2", modelCode: "A", code: "PAINT", name: "دهان", nameEn: null, weightPercent: 40, groupCode: "FIN", groupName: "تشطيب", groupNameEn: null, stageCode: "INT", stageName: "داخلي", stageNameEn: null },
  ],
  cells: [{ id: "c1", unitId: "u1", definitionId: "d1", status: "COMPLETE", verificationStatusId: null, assignedUserId: null, lastChangedAt: at }, { id: "c2", unitId: "u2", definitionId: "d2", status: "COMPLETE", verificationStatusId: null, assignedUserId: null, lastChangedAt: at }],
  history: [], verification: [], requests: [], baselines: new Map(), people: new Map(), sources: [],
};
const strip = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => (["groupName", "name", "label", "stageName", "activityName"].includes(key) ? undefined : v)));

describe("withActivityNames (Q-49)", () => {
  it("POSITIVE: English names where they exist; a missing activity name shows the Arabic one marked in the reader's language; groups and stages unmarked", () => {
    const english = withActivityNames(base, "en", "en");
    expect(english.definitions.map(d => [d.name, d.groupName, d.stageName])).toEqual([["Footings", "Concrete", "هيكل"], ["دهان · in Arabic", "تشطيب", "داخلي"]]);
    expect(withActivityNames(base, "en", "ar").definitions[1].name).toBe("دهان · بالعربية");
  });

  it("NEGATIVE: Arabic, no choice, or a project with no English name at all leave the names as stored", () => {
    expect(withActivityNames(base, "ar")).toBe(base);
    expect(withActivityNames(base, undefined)).toBe(base);
    const noEnglish: PmcDataset = { ...base, definitions: base.definitions.map(d => ({ ...d, nameEn: null, groupNameEn: null, stageNameEn: null })) };
    expect(datasetHasEnglishNames(noEnglish)).toBe(false);
    expect(withActivityNames(noEnglish, "en")).toBe(noEnglish);
  });

  it("display only: every number on the activities and stages screens is the same in both languages", () => {
    const english = withActivityNames(base, "en", "en");
    expect(strip(activitiesMatrix(english))).toEqual(strip(activitiesMatrix(base)));
    expect(strip(stagesView(english))).toEqual(strip(stagesView(base)));
    expect(JSON.stringify(activitiesMatrix(english))).toContain("Footings");
  });
});
