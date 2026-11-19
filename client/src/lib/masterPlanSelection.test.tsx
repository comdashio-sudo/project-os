import { describe, expect, it } from "vitest";
import { MODEL_HATCHES, boundsOf, hatchIndexOf, pickVilla, searchVillas, westernDigits, type ListedVilla } from "./masterPlanSelection";

const villa = (n: number, modelCode: string | null = "A"): ListedVilla => ({ polygonId: `p-${n}`, unitCode: `B1-U-${String(n).padStart(4, "0")}`, modelCode });

describe("Q-40: master plan selection helpers", () => {
  it("a number finds that villa first, then codes holding the digits; Eastern digits read as Western", () => {
    const list = [villa(12), villa(120), villa(3), villa(212)];
    expect(searchVillas(list, "12").map(v => v.polygonId)).toEqual(["p-12", "p-120", "p-212"]);
    expect(searchVillas(list, "١٢")[0]!.polygonId).toBe("p-12");
    expect(searchVillas(list, "۱۲")[0]!.polygonId).toBe("p-12");
    expect(westernDigits("فيلا ٣٠")).toBe("فيلا 30");
  });

  it("text matches the code or the type, ignoring case; an empty query keeps all; no match gives none", () => {
    const list = [villa(1, "A"), villa(2, "Villa-B"), villa(3, null)];
    expect(searchVillas(list, "villa-b").map(v => v.polygonId)).toEqual(["p-2"]);
    expect(searchVillas(list, "b1-u-0003").map(v => v.polygonId)).toEqual(["p-3"]);
    expect(searchVillas(list, "  ")).toHaveLength(3);
    expect(searchVillas(list, "999")).toEqual([]);
    expect(searchVillas(list, "zzz")).toEqual([]);
  });

  it("a plain pick replaces the choice; several adds and removes, never changing the set it was given", () => {
    const start = new Set(["p-1"]);
    expect(Array.from(pickVilla(start, "p-2", false))).toEqual(["p-2"]);
    const added = pickVilla(start, "p-2", true);
    expect(Array.from(added).sort()).toEqual(["p-1", "p-2"]);
    expect(Array.from(pickVilla(added, "p-1", true))).toEqual(["p-2"]);
    expect(Array.from(start)).toEqual(["p-1"]);
  });

  it("bounds cover every point, and nothing gives null", () => {
    expect(boundsOf([{ x: 5, y: 1 }, { x: -2, y: 9 }, { x: 3, y: 4 }])).toEqual({ x: -2, y: 1, width: 7, height: 8 });
    expect(boundsOf([])).toBeNull();
  });

  it("each type keeps one hatch by its sorted place, and a ninth type wraps round", () => {
    const codes = ["C", "A", "B", "D", "E", "F", "G", "H", "I"];
    const map = hatchIndexOf(codes);
    expect(map.get("A")).toBe(0);
    expect(map.get("C")).toBe(2);
    expect(map.get("I")).toBe(MODEL_HATCHES.length === 8 ? 0 : 8);
    expect(new Set(["A", "B", "C", "D", "E", "F", "G", "H"].map(code => map.get(code))).size).toBe(8);
    // the two types most plans have are told apart by kind, not only by angle
    expect(MODEL_HATCHES[0]!.kind).not.toBe(MODEL_HATCHES[1]!.kind);
    expect(new Set(MODEL_HATCHES.map(h => `${h.kind}:${h.angle}:${h.spacing}`)).size).toBe(MODEL_HATCHES.length);
  });

  it("500 villas: a search over all of them returns at once and in order", () => {
    const list = Array.from({ length: 500 }, (_, i) => villa(i + 1, i % 2 ? "A" : "B"));
    const started = performance.now();
    for (let i = 0; i < 50; i++) searchVillas(list, String(i + 1));
    expect(performance.now() - started).toBeLessThan(500);
    expect(searchVillas(list, "250")[0]!.polygonId).toBe("p-250");
    expect(searchVillas(list, "").map(v => v.polygonId)).toEqual(list.map(v => v.polygonId));
  });
});
