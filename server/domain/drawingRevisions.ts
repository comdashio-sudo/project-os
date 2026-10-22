// Drawing revisions and drawing status (work order 5, item 7): the rules that need no database, so they can be tested alone and read by the
// screen as well. A revision is a letter, A, B ... Z, AA, AB ..., the convention of the drawing register (the form starts at A).
// The service (server/designService.ts) applies these rules inside transactions.

import type { DrawingStatus } from "./designCoordination";

const MAX_LABEL_LETTERS = 10; // keeps every sequence well inside the safe integer range

/** Sequence 0 is "A", 25 is "Z", 26 is "AA": spreadsheet-style, so the labels do not run out. */
export function revisionLabel(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError("revision sequence must be a non-negative integer");
  let rest = sequence;
  let label = "";
  do {
    label = String.fromCharCode(65 + (rest % 26)) + label;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return label;
}

/** The sequence of a revision label ("A" is 0), or null when the text is not a revision label (lower case, digits, empty, too long). */
export function revisionSequence(label: string): number | null {
  if (!new RegExp(`^[A-Z]{1,${MAX_LABEL_LETTERS}}$`).test(label)) return null;
  let value = 0;
  for (const letter of label) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

/** The label after the given one; the first revision is "A". Null when the given label is not a revision label. */
export function nextRevision(current: string | null): string | null {
  if (current === null) return revisionLabel(0);
  const sequence = revisionSequence(current);
  return sequence === null ? null : revisionLabel(sequence + 1);
}

export type RevisionRefusal = "REVISION_LABEL_INVALID" | "REVISION_ALREADY_ISSUED" | "REVISION_NOT_NEXT";

/**
 * A new revision must be exactly the next label after the highest one issued: no skipping ("A" then "C") and no reuse ("B" again, or any
 * label already issued). `issued` is every label the drawing has had, cancelled history included, because the register keeps every revision.
 */
export function checkNewRevision(issued: readonly string[], candidate: string): { ok: true; label: string } | { ok: false; code: RevisionRefusal } {
  const sequence = revisionSequence(candidate);
  if (sequence === null) return { ok: false, code: "REVISION_LABEL_INVALID" };
  if (issued.includes(candidate)) return { ok: false, code: "REVISION_ALREADY_ISSUED" };
  const sequences = issued.map(revisionSequence).filter((item): item is number => item !== null);
  const expected = sequences.length ? Math.max(...sequences) + 1 : 0;
  if (sequence !== expected) return { ok: false, code: "REVISION_NOT_NEXT" };
  return { ok: true, label: candidate };
}

/**
 * The revision in force: the highest label issued, or null when the drawing has none. The service always makes the newest revision the
 * current one, so the highest label and the current flag agree; labels that are not revision labels (legacy free text) are skipped.
 */
export function currentRevision(issued: readonly string[]): string | null {
  let best: { label: string; sequence: number } | null = null;
  for (const label of issued) {
    const sequence = revisionSequence(label);
    if (sequence !== null && (best === null || sequence > best.sequence)) best = { label, sequence };
  }
  return best?.label ?? null;
}

/**
 * Registered and under review may be cancelled. Approved is terminal: only a new revision changes it (see statusAfterRevision).
 * Cancelled is terminal. The table is the one the screen reads; the service checks the same table.
 */
export const drawingTransitions: Record<DrawingStatus, readonly DrawingStatus[]> = {
  registered: ["under_review", "cancelled"],
  under_review: ["approved", "cancelled"],
  approved: [],
  cancelled: [],
};

export type DrawingRefusal = "DRAWING_TRANSITION_INVALID" | "DRAWING_APPROVED" | "DRAWING_CANCELLED";

/** Whether a drawing may move from one status to another, and if not, why. An approved or cancelled drawing gets its own code. */
export function checkDrawingTransition(from: DrawingStatus, to: DrawingStatus): { ok: true } | { ok: false; code: DrawingRefusal } {
  if (from === "cancelled") return { ok: false, code: "DRAWING_CANCELLED" };
  if (from === "approved") return { ok: false, code: "DRAWING_APPROVED" };
  if (!drawingTransitions[from]?.includes(to)) return { ok: false, code: "DRAWING_TRANSITION_INVALID" };
  return { ok: true };
}

/** A new revision puts the drawing back to registered, from any status except cancelled (it also voids an approval). */
export function statusAfterRevision(from: DrawingStatus): { ok: true; status: "registered" } | { ok: false; code: "DRAWING_CANCELLED" } {
  if (from === "cancelled") return { ok: false, code: "DRAWING_CANCELLED" };
  return { ok: true, status: "registered" };
}
