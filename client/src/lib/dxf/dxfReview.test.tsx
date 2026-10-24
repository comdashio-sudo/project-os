// Synthetic fixtures only. Every drawing and unit code below is built in this file; no real drawing or personal data.
import { describe, expect, it } from "vitest";
import { matchDrawingToUnits, type ProjectUnit } from "./dxfMatch";
import { readDxf } from "./dxfReader";
import {
  PROPOSED_COLOUR,
  UNIT_STATUS_COLOUR,
  UNLINKED_COLOUR,
  assignUnit,
  buildReview,
  clearLink,
  confirmLink,
  confirmedLinks,
  exportLinksCsv,
  exportLinksJson,
  polygonFill,
  rejectLink,
  summarizeReview,
  type ReviewItem,
  type ReviewResult,
} from "./dxfReview";

type Group = [number, string | number];

const group = (code: number, value: string | number): string => `${code}\r\n${value}\r\n`;
const entity = (type: string, groups: Group[]): string => group(0, type) + groups.map(([code, value]) => group(code, value)).join("");

function dxf(entities: string): string {
  return (
    group(0, "SECTION") + group(2, "HEADER") + group(9, "$ACADVER") + group(1, "AC1027") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "TABLES") + group(0, "TABLE") + group(2, "LAYER") + group(70, 1) +
    group(0, "LAYER") + group(2, "UNITS") + group(70, 0) + group(62, 7) + group(6, "CONTINUOUS") +
    group(0, "ENDTAB") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "ENTITIES") + entities + group(0, "ENDSEC") + group(0, "EOF")
  );
}

const square = (x: number, y: number, size = 10): string =>
  entity("LWPOLYLINE", [[8, "UNITS"], [90, 4], [70, 1], [10, x], [20, y], [10, x + size], [20, y], [10, x + size], [20, y + size], [10, x], [20, y + size]]);

const text = (x: number, y: number, value: string): string => entity("TEXT", [[8, "UNITS"], [10, x], [20, y], [40, 2.5], [1, value]]);

const UNITS: ProjectUnit[] = [
  { id: "unit-1", code: "B1-U-0001" },
  { id: "unit-2", code: "B1-U-0002" },
  { id: "unit-3", code: "B1-U-0003" },
];

// Three shapes: two carry a unit code inside, the third has no text.
function reviewFixture(): ReviewItem[] {
  const parsed = readDxf(new TextEncoder().encode(dxf(square(0, 0) + text(5, 5, "B1-U-0001") + square(20, 0) + text(25, 5, "B1-U-0002") + square(40, 0))));
  if (!parsed.ok) throw new Error("fixture must read");
  return buildReview(parsed.drawing, matchDrawingToUnits(parsed.drawing, UNITS));
}

const idOf = (items: ReviewItem[], index: number): string => items[index].polygonId;

function expectOk(result: ReviewResult): ReviewItem[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.items;
}

describe("buildReview", () => {
  it("starts linked matches as proposals and unmatched shapes as unlinked with a reason", () => {
    const items = reviewFixture();
    expect(items.map(item => item.state)).toEqual(["proposed", "proposed", "unlinked"]);
    expect(items[0]).toMatchObject({ unitId: "unit-1", unitCode: "B1-U-0001", reason: null });
    expect(items[2]).toMatchObject({ unitId: null, reason: "no_text" });
  });

  it("keeps candidate units when a unit code is duplicated and marks several texts inside one shape", () => {
    const parsed = readDxf(new TextEncoder().encode(dxf(square(0, 0) + text(2, 2, "B1-U-0001") + text(6, 6, "B1-U-0009") + square(20, 0) + text(25, 5, "B1-U-0002"))));
    if (!parsed.ok) throw new Error("fixture must read");
    const items = buildReview(parsed.drawing, matchDrawingToUnits(parsed.drawing, UNITS));
    expect(items[0]).toMatchObject({ state: "unlinked", reason: "several_texts_in_polygon" });
    expect(items[1].state).toBe("proposed");
  });
});

describe("review actions", () => {
  it("confirms a proposal", () => {
    const items = reviewFixture();
    const next = expectOk(confirmLink(items, idOf(items, 0)));
    expect(next[0].state).toBe("confirmed");
    expect(items[0].state).toBe("proposed");
  });

  it("refuses to confirm a shape that has no proposal", () => {
    const items = reviewFixture();
    const result = confirmLink(items, idOf(items, 2));
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_PROPOSED" } });
  });

  it("reports an unknown shape", () => {
    const items = reviewFixture();
    expect(confirmLink(items, "no-such-shape")).toMatchObject({ ok: false, error: { code: "UNKNOWN_POLYGON" } });
  });

  it("assigns a unit to an unlinked shape and confirms it", () => {
    const items = reviewFixture();
    const next = expectOk(assignUnit(items, idOf(items, 2), UNITS[2]));
    expect(next[2]).toMatchObject({ state: "confirmed", unitId: "unit-3", unitCode: "B1-U-0003", reason: null });
  });

  it("refuses to assign a unit that is already confirmed on another shape", () => {
    const items = expectOk(confirmLink(reviewFixture(), idOf(reviewFixture(), 0)));
    const result = assignUnit(items, idOf(items, 2), UNITS[0]);
    expect(result).toMatchObject({ ok: false, error: { code: "UNIT_ALREADY_CONFIRMED" } });
  });

  it("rejects a proposal, which removes the link and records the reason", () => {
    const items = reviewFixture();
    const next = expectOk(rejectLink(items, idOf(items, 0)));
    expect(next[0]).toMatchObject({ state: "unlinked", unitId: null, unitCode: null, reason: "rejected_by_reviewer" });
  });

  it("clears a confirmed link back to unlinked", () => {
    const confirmed = expectOk(confirmLink(reviewFixture(), idOf(reviewFixture(), 0)));
    const next = expectOk(clearLink(confirmed, idOf(confirmed, 0)));
    expect(next[0]).toMatchObject({ state: "unlinked", unitId: null, reason: null });
  });

  it("gives every error a message in all three languages", () => {
    const result = confirmLink(reviewFixture(), idOf(reviewFixture(), 2));
    if (result.ok) throw new Error("expected an error");
    expect(result.error.message.ar).not.toBe("");
    expect(result.error.message.en).not.toBe("");
    expect(result.error.message.ur).not.toBe("");
  });
});

describe("summary", () => {
  it("counts states and units that still need a link", () => {
    const items = expectOk(confirmLink(reviewFixture(), idOf(reviewFixture(), 0)));
    expect(summarizeReview(items, UNITS)).toEqual({ polygons: 3, confirmed: 1, proposed: 1, unlinked: 1, unitsTotal: 3, unitsConfirmed: 1, unitsRemaining: 2 });
  });
});

describe("export", () => {
  it("exports confirmed links only, sorted by unit code", () => {
    let items = reviewFixture();
    items = expectOk(assignUnit(items, idOf(items, 2), UNITS[2]));
    items = expectOk(confirmLink(items, idOf(items, 1)));
    const csv = exportLinksCsv(items);
    expect(csv.split("\n")).toEqual(["polygon_id,unit_code,unit_id", `${idOf(items, 1)},B1-U-0002,unit-2`, `${idOf(items, 2)},B1-U-0003,unit-3`, ""]);
    expect(csv).not.toContain("B1-U-0001");
  });

  it("writes only the header when nothing is confirmed", () => {
    expect(exportLinksCsv(reviewFixture())).toBe("polygon_id,unit_code,unit_id\n");
  });

  it("quotes cells with commas or quotes and neutralises formula-like cells", () => {
    const items: ReviewItem[] = [{ polygonId: 'p,"1"', layer: "UNITS", unitId: "u", unitCode: "=HYPERLINK(1)", state: "confirmed", reason: null, candidateUnitIds: [] }];
    const row = exportLinksCsv(items).split("\n")[1];
    expect(row).toBe(`"p,""1""",'=HYPERLINK(1),u`);
  });

  it("exports the same confirmed links as JSON", () => {
    const items = expectOk(confirmLink(reviewFixture(), idOf(reviewFixture(), 0)));
    expect(JSON.parse(exportLinksJson(items))).toEqual({ links: [{ polygonId: idOf(items, 0), unitId: "unit-1", unitCode: "B1-U-0001" }] });
    expect(confirmedLinks(items)).toHaveLength(1);
  });
});

describe("colour", () => {
  const base = reviewFixture()[0];

  it("colours a confirmed shape by its unit status", () => {
    const confirmed = { ...base, state: "confirmed" as const };
    expect(polygonFill(confirmed, "blocked")).toBe(UNIT_STATUS_COLOUR.blocked);
    expect(polygonFill(confirmed, "completed")).toBe(UNIT_STATUS_COLOUR.completed);
  });

  it("falls back for an unknown status and keeps proposed and unlinked colours fixed", () => {
    expect(polygonFill({ ...base, state: "confirmed" }, "something_else")).toBe(UNIT_STATUS_COLOUR.not_started);
    expect(polygonFill({ ...base, state: "proposed" }, "completed")).toBe(PROPOSED_COLOUR);
    expect(polygonFill({ ...base, state: "unlinked" }, "completed")).toBe(UNLINKED_COLOUR);
  });
});
