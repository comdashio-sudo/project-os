import { describe, expect, it } from "vitest";
import { stageMappingReadiness, stageOfActivity, suggestStageLinks, validateStageLinks, type ScheduleStage, type WeightGroup } from "./scheduleStageMapping";

// Synthetic names and codes only. The schedule's Q codes deliberately disagree with the weights file's (as the adviser found): schedule Q06 is the roof
// installation, weights Q06 the concrete structure — so a suggestion by code would be wrong, and none is made.
const stages: ScheduleStage[] = [
  { code: "Q02", name: "Substructure works", activities: 4, villas: 4 },
  { code: "Q06", name: "Roof installation", activities: 4, villas: 4 },
  { code: "Q07", name: "Wall panels installation", activities: 4, villas: 4 },
  { code: "Q20", name: "Boundary fences", activities: 4, villas: 4 },
];
const groups: WeightGroup[] = [
  { id: "g-sub", code: "Q01", name: "أعمال الأساسات", nameEn: "Substructure", weight: 8 },
  { id: "g-con", code: "Q06", name: "الهيكل الخرساني", nameEn: "Concrete structure", weight: 24.9 },
  { id: "g-fac", code: "Q05", name: "إنتاج المصنع", nameEn: "Factory production", weight: 26.5 },
  { id: "g-fen", code: "Q07", name: "الأسوار", nameEn: "Boundary fences", weight: 3 },
  { id: "g-zero", code: "Q99", name: "بند بلا وزن", nameEn: null, weight: 0 },
];

describe("Q-61 (3): schedule stage ← weight group", () => {
  it("an activity's stage: its Q Item code, else the segment after the villa in its code; none for an activity outside a villa", () => {
    expect(stageOfActivity({ code: "V606.010", codes: { "Q Item": "q02" } })).toBe("Q02");
    expect(stageOfActivity({ code: "V606.Q07", codes: {} })).toBe("Q07");
    expect(stageOfActivity({ code: "V606-Q20-010", codes: { "Villa Type": "C" } })).toBe("Q20");
    expect(stageOfActivity({ code: "MOB-010", codes: {} })).toBeNull();
  });

  it("suggests by name (Arabic or English), never by code: weights Q06 «concrete structure» is not given schedule Q06 «roof installation»; a group with no fitting name gets nothing", () => {
    const suggested = new Map(suggestStageLinks(groups, stages).map(item => [item.groupId, item]));
    expect(suggested.get("g-sub")?.stageCode).toBe("Q02");
    expect(suggested.get("g-fen")).toEqual({ groupId: "g-fen", stageCode: "Q20", score: 1 });
    expect(suggested.has("g-con")).toBe(false);
    expect(suggested.has("g-fac")).toBe(false);
  });

  it("NEGATIVE: a start/end link names exactly one stage; a stage must be in the schedule; a group appears once; an empty list (removal) passes", () => {
    expect(validateStageLinks([{ groupId: "g-fac", stageCodes: ["Q06", "Q07"], anchor: "start", suggestedScore: null }], stages)).toEqual([{ groupId: "g-fac", problem: "ANCHOR_NEEDS_ONE_STAGE" }]);
    expect(validateStageLinks([{ groupId: "g-con", stageCodes: ["Q07", "Q26"], anchor: "span", suggestedScore: null }], stages)).toEqual([{ groupId: "g-con", problem: "STAGE_NOT_IN_SCHEDULE", stageCodes: ["Q26"] }]);
    expect(validateStageLinks([{ groupId: "g-sub", stageCodes: ["Q02"], anchor: "span", suggestedScore: null }, { groupId: "g-sub", stageCodes: [], anchor: "span", suggestedScore: null }], stages)[0].problem).toBe("DUPLICATE_GROUP");
    expect(validateStageLinks([{ groupId: "g-sub", stageCodes: ["Q02"], anchor: "span", suggestedScore: 0.8 }, { groupId: "g-fac", stageCodes: ["Q06"], anchor: "end", suggestedScore: null }, { groupId: "g-fen", stageCodes: [], anchor: "span", suggestedScore: null }], stages)).toEqual([]);
  });

  it("ready only when every group with weight > 0 is linked and every linked stage is still in the schedule; a weightless group need not be linked", () => {
    const partial = [{ groupId: "g-sub", stageCodes: ["Q02"], anchor: "span" as const, suggestedScore: null }];
    expect(stageMappingReadiness(groups, partial, stages)).toMatchObject({ ready: false, unlinked: ["Q06", "Q05", "Q07"], stale: [] });
    const all = [
      ...partial,
      { groupId: "g-con", stageCodes: ["Q07", "Q06"], anchor: "span" as const, suggestedScore: null },
      { groupId: "g-fac", stageCodes: ["Q06"], anchor: "start" as const, suggestedScore: null },
      { groupId: "g-fen", stageCodes: ["Q20"], anchor: "span" as const, suggestedScore: 1 },
    ];
    expect(stageMappingReadiness(groups, all, stages)).toEqual({ ready: true, unlinked: [], stale: [], stagesWithoutGroup: [] });
    // a later import without Q20: the fences link points nowhere, so the curve waits
    expect(stageMappingReadiness(groups, all, stages.filter(stage => stage.code !== "Q20"))).toMatchObject({ ready: false, stale: [{ groupCode: "Q07", stageCodes: ["Q20"] }] });
    // no schedule at all: never ready
    expect(stageMappingReadiness(groups, all, []).ready).toBe(false);
  });
});
