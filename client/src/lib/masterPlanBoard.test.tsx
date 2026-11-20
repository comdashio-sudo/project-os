import { describe, expect, it } from "vitest";
import { boardStateOf, countStates, groupBoard, type BoardEntity } from "./masterPlanBoard";

const unit = (id: string, parent: string | null, status: string, progress: number): BoardEntity => ({ id, code: id, name: id, entityType: "unit", parentEntityId: parent, status, progressPercent: String(progress) });

describe("master-plan board", () => {
  it("lets status win over progress, then bands the percentage", () => {
    expect(boardStateOf({ status: "blocked", progressPercent: "90" })).toBe("stopped");
    expect(boardStateOf({ status: "completed", progressPercent: "10" })).toBe("complete");
    expect(boardStateOf({ status: "in_progress", progressPercent: "100" })).toBe("complete");
    expect(boardStateOf({ status: "in_progress", progressPercent: "60" })).toBe("advanced");
    expect(boardStateOf({ status: "in_progress", progressPercent: "59.9" })).toBe("progress");
    expect(boardStateOf({ status: "in_progress", progressPercent: "25" })).toBe("progress");
    expect(boardStateOf({ status: "in_progress", progressPercent: "0" })).toBe("start");
    expect(boardStateOf({ status: "not_started", progressPercent: "3" })).toBe("start");
    expect(boardStateOf({ status: "not_started", progressPercent: null })).toBe("none");
    expect(boardStateOf({ status: "not_started", progressPercent: "abc" })).toBe("none");
  });

  it("groups units under their block in numeric code order, averages progress, and puts units without a block last", () => {
    const blocks: BoardEntity[] = [
      { id: "B10", code: "B10", name: "Block 10", entityType: "block", parentEntityId: null, status: "in_progress", progressPercent: "0" },
      { id: "B2", code: "B2", name: "Block 2", entityType: "block", parentEntityId: null, status: "in_progress", progressPercent: "0" },
    ];
    const grouped = groupBoard([...blocks, unit("V10", "B2", "in_progress", 50), unit("V9", "B2", "in_progress", 0), unit("V1", "B10", "blocked", 30), unit("X1", null, "not_started", 0)]);
    expect(grouped.map(block => block.code)).toEqual(["B2", "B10", ""]);
    expect(grouped[0].units.map(entry => entry.code)).toEqual(["V9", "V10"]);
    expect(grouped[0].progress).toBe(25);
    expect(countStates(grouped)).toEqual({ complete: 0, advanced: 0, progress: 1, start: 1, none: 1, stopped: 1 });
  });

  it("shows nothing when there are no units (blocks alone are not tiles)", () => {
    expect(groupBoard([{ id: "B1", code: "B1", name: "", entityType: "block", parentEntityId: null, status: "not_started", progressPercent: "0" }])).toEqual([]);
  });
});
