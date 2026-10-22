import { describe, expect, it } from "vitest";
import { DRAWING_STATUSES } from "./designCoordination";
import { checkDrawingTransition, checkNewRevision, currentRevision, drawingTransitions, nextRevision, revisionLabel, revisionSequence, statusAfterRevision } from "./drawingRevisions";

describe("revision labels", () => {
  it("runs A, B ... Z, then AA, AB, spreadsheet-style, so the labels never run out", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(revisionLabel)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("reads a label back to its sequence, and gives null for anything that is not a revision label", () => {
    expect(["A", "Z", "AA", "AZ", "BA"].map(revisionSequence)).toEqual([0, 25, 26, 51, 52]);
    expect(["", "a", "1", "A1", "A B", "ABCDEFGHIJK"].map(revisionSequence)).toEqual([null, null, null, null, null, null]);
  });

  it("round-trips every label up to a few thousand", () => {
    for (let sequence = 0; sequence < 3000; sequence++) expect(revisionSequence(revisionLabel(sequence))).toBe(sequence);
  });

  it("refuses to make a label from a negative or fractional sequence (a programming error, not user input)", () => {
    expect(() => revisionLabel(-1)).toThrow(RangeError);
    expect(() => revisionLabel(1.5)).toThrow(RangeError);
  });

  it("the next revision after nothing is A, and after a revision is the letter that follows it", () => {
    expect(nextRevision(null)).toBe("A");
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("Z")).toBe("AA");
    expect(nextRevision("b")).toBeNull();
  });
});

describe("a new revision is exactly the next one", () => {
  it("accepts the next letter after the highest issued, and the first one when none is issued", () => {
    expect(checkNewRevision([], "A")).toEqual({ ok: true, label: "A" });
    expect(checkNewRevision(["A", "B"], "C")).toEqual({ ok: true, label: "C" });
    expect(checkNewRevision(["A", "B", "C"], "D")).toEqual({ ok: true, label: "D" });
  });

  it("refuses a skipped letter", () => {
    expect(checkNewRevision(["A"], "C")).toEqual({ ok: false, code: "REVISION_NOT_NEXT" });
    expect(checkNewRevision([], "B")).toEqual({ ok: false, code: "REVISION_NOT_NEXT" });
  });

  it("refuses a reused letter, including one from a revision that was superseded long ago", () => {
    expect(checkNewRevision(["A", "B"], "B")).toEqual({ ok: false, code: "REVISION_ALREADY_ISSUED" });
    expect(checkNewRevision(["A", "B", "C"], "A")).toEqual({ ok: false, code: "REVISION_ALREADY_ISSUED" });
  });

  it("refuses a label that is not a revision label at all", () => {
    expect(checkNewRevision(["A"], "b")).toEqual({ ok: false, code: "REVISION_LABEL_INVALID" });
    expect(checkNewRevision(["A"], "2")).toEqual({ ok: false, code: "REVISION_LABEL_INVALID" });
  });

  it("skips legacy free-text labels when it looks for the highest issued, so one odd old label does not block the next letter", () => {
    expect(checkNewRevision(["A", "rev-x"], "B")).toEqual({ ok: true, label: "B" });
  });
});

describe("the current revision", () => {
  it("is the highest label issued, whatever order the list comes in", () => {
    expect(currentRevision(["B", "A", "C"])).toBe("C");
    expect(currentRevision(["Z", "AA", "Y"])).toBe("AA");
  });

  it("is null when the drawing has no revision, and skips legacy labels that are not revision labels", () => {
    expect(currentRevision([])).toBeNull();
    expect(currentRevision(["rev-x"])).toBeNull();
    expect(currentRevision(["A", "1"])).toBe("A");
  });
});

describe("drawing status", () => {
  it("has a transition entry for each of the four statuses, and no other", () => {
    expect(Object.keys(drawingTransitions).sort()).toEqual([...DRAWING_STATUSES].sort());
  });

  it("moves through review to approval, and allows cancellation only from registered or under review", () => {
    expect(checkDrawingTransition("registered", "under_review")).toEqual({ ok: true });
    expect(checkDrawingTransition("under_review", "approved")).toEqual({ ok: true });
    expect(checkDrawingTransition("registered", "cancelled")).toEqual({ ok: true });
    expect(checkDrawingTransition("under_review", "cancelled")).toEqual({ ok: true });
  });

  it("refuses to approve a drawing that is not under review, and names the invalid move", () => {
    expect(checkDrawingTransition("registered", "approved")).toEqual({ ok: false, code: "DRAWING_TRANSITION_INVALID" });
    expect(checkDrawingTransition("registered", "registered")).toEqual({ ok: false, code: "DRAWING_TRANSITION_INVALID" });
    expect(checkDrawingTransition("under_review", "under_review")).toEqual({ ok: false, code: "DRAWING_TRANSITION_INVALID" });
  });

  it("keeps an approved drawing approved: only a new revision changes it, and a cancel is refused with its own code", () => {
    expect(checkDrawingTransition("approved", "cancelled")).toEqual({ ok: false, code: "DRAWING_APPROVED" });
    expect(checkDrawingTransition("approved", "registered")).toEqual({ ok: false, code: "DRAWING_APPROVED" });
    expect(checkDrawingTransition("approved", "under_review")).toEqual({ ok: false, code: "DRAWING_APPROVED" });
    expect(statusAfterRevision("approved")).toEqual({ ok: true, status: "registered" });
  });

  it("refuses every move out of cancelled, and a revision on a cancelled drawing", () => {
    for (const to of DRAWING_STATUSES) expect(checkDrawingTransition("cancelled", to)).toEqual({ ok: false, code: "DRAWING_CANCELLED" });
    expect(statusAfterRevision("cancelled")).toEqual({ ok: false, code: "DRAWING_CANCELLED" });
  });

  it("sends a drawing back to registered on a new revision, from registered, under review or approved", () => {
    expect(statusAfterRevision("registered")).toEqual({ ok: true, status: "registered" });
    expect(statusAfterRevision("under_review")).toEqual({ ok: true, status: "registered" });
  });
});
