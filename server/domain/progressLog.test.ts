import { describe, expect, it } from "vitest";
import { groupProgressLog, sourceOf, type LogRow } from "./progressLog";

// Q-70 (1): history rows folded back into the entries a person made. Synthetic data only.
const row = (id: string, villa: string, extra: Partial<LogRow> = {}): LogRow => ({ id, at: new Date("2026-11-20T09:00:00Z"), note: "batch b1", activityCode: "ACT01", activityName: "Excavation", from: null, to: "COMPLETE", byUserId: 1, byName: "Engineer (synthetic)", villa, blockCode: "BLK 33", ...extra });

describe("the progress log's entries (Q-70 1)", () => {
  it("POSITIVE: the 4 rows of one save are one entry with 4 villas; an import of the same day is one entry per activity and change", () => {
    const entries = groupProgressLog([row("1", "702"), row("2", "700"), row("3", "701"), row("4", "703", { blockCode: "BLK 34" }),
      row("5", "700", { note: "import", at: new Date("2026-11-19T08:00:00Z") }), row("6", "701", { note: "import", at: new Date("2026-11-19T10:00:00Z") })]);
    expect(entries.map(entry => [entry.source, entry.villas])).toEqual([["manual", ["700", "701", "702", "703"]], ["import", ["700", "701"]]]);
    expect(entries[0].blocks).toEqual(["BLK 33", "BLK 34"]);
  });

  it("NEGATIVE: different saves, people, changes, days or single-cell edits are never folded together", () => {
    const entries = groupProgressLog([row("1", "700"), row("2", "701", { note: "batch b2" }), row("3", "702", { byUserId: 2 }), row("4", "703", { to: "IN_PROGRESS" }),
      row("5", "704", { note: null }), row("6", "705", { note: null }),
      row("7", "706", { note: "import", at: new Date("2026-11-18T08:00:00Z") }), row("8", "707", { note: "import", at: new Date("2026-11-19T08:00:00Z") })]);
    expect(entries).toHaveLength(8);
  });

  it("names the source from the note", () => {
    expect([sourceOf({ note: "batch x" }), sourceOf({ note: "undo x" }), sourceOf({ note: "import" }), sourceOf({ note: "Daily report 2026-11-20" }), sourceOf({ note: null }), sourceOf({ note: null, isQc: true })])
      .toEqual(["manual", "undo", "import", "dailyReport", "cell", "qc"]);
  });
});
