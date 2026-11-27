import { describe, expect, it } from "vitest";
import { filterVillas, summarizeSelection, villasOf, type PickerVilla } from "./villaPicker";
import { matchOptions } from "@/components/SearchCombobox";

// Q-67 (2)(3): the villas a choice covers and the summary shown before the save. Synthetic data only.
const villas: PickerVilla[] = [
  { villa: "700", number: 700, block: "BLK 33", phase: "PH1", model: "C", status: "COMPLETE" },
  { villa: "701", number: 701, block: "BLK 33", phase: "PH1", model: "C+", status: "NOT_STARTED" },
  { villa: "702", number: 702, block: "BLK 34", phase: "PH2", model: "D", status: "IN_PROGRESS" },
  { villa: "703", number: 703, block: "BLK 34", phase: "PH2", model: "D", status: "UNDER_REVIEW" },
];

describe("the villa picker (Q-67)", () => {
  it("POSITIVE: a phase, blocks, a model, a range (either way round) and a ticked list each give their villas in the project's order", () => {
    expect(villasOf(villas, { mode: "phase", phases: ["PH2"] }).map(villa => villa.villa)).toEqual(["702", "703"]);
    expect(villasOf(villas, { mode: "block", blocks: ["BLK 34", "BLK 33"] }).map(villa => villa.villa)).toEqual(["700", "701", "702", "703"]);
    expect(villasOf(villas, { mode: "model", models: ["C+"] }).map(villa => villa.villa)).toEqual(["701"]);
    expect(villasOf(villas, { mode: "range", from: "703", to: "701" }).map(villa => villa.villa)).toEqual(["701", "702", "703"]);
    expect(villasOf(villas, { mode: "list", villas: ["703", "700"] }).map(villa => villa.villa)).toEqual(["700", "703"]);
  });

  it("NEGATIVE: an empty choice, or a range with an end that is not a villa of the project, covers none", () => {
    expect(villasOf(villas, { mode: "block", blocks: [] })).toEqual([]);
    expect(villasOf(villas, { mode: "range", from: "700", to: "999" })).toEqual([]);
    expect(villasOf(villas, { mode: "range", from: "", to: "" })).toEqual([]);
  });

  it("POSITIVE: the summary — chosen, the villas the item does not apply to (by model, not sent), and those whose status is higher than the new one", () => {
    const summary = summarizeSelection(villas, ["C", "D"], "IN_PROGRESS");
    expect(summary).toEqual({ chosen: 4, applicable: ["700", "702", "703"], excluded: [{ villa: "701", model: "C+" }], excludedModels: ["C+"], movingBack: [{ villa: "700", from: "COMPLETE" }, { villa: "703", from: "UNDER_REVIEW" }] });
    // complete moves nothing back; no activity chosen excludes nothing
    expect(summarizeSelection(villas, ["C", "D"], "COMPLETE").movingBack).toEqual([]);
    expect(summarizeSelection(villas, null, "COMPLETE").excluded).toEqual([]);
  });

  it("the list's filters and search", () => {
    expect(filterVillas(villas, { block: "BLK 34", model: "D", search: "3" }).map(villa => villa.villa)).toEqual(["703"]);
    expect(filterVillas(villas, { phase: "PH9" })).toEqual([]);
  });

  it("Q-67 (1): the activity search finds by code, by either name, by part of a word, and every word typed must match", () => {
    const options = [{ value: "IP-001", code: "IP-001", label: "صب القواعد", keywords: "Footings", group: "Q02 — الهيكل" }, { value: "IP-014", code: "IP-014", label: "الدهان", keywords: "Painting", group: "Q09 — التشطيبات" }];
    expect(matchOptions(options, "قواعد").map(option => option.value)).toEqual(["IP-001"]);
    expect(matchOptions(options, "ip-00").map(option => option.value)).toEqual(["IP-001"]);
    expect(matchOptions(options, "paint").map(option => option.value)).toEqual(["IP-014"]);
    expect(matchOptions(options, "Q09 دهان").map(option => option.value)).toEqual(["IP-014"]);
    expect(matchOptions(options, "قواعد Painting")).toEqual([]);
    expect(matchOptions(options, "  ")).toEqual(options);
  });
});
