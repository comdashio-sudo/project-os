// Review editor for DXF-to-unit links (work order 13, items 9 to 11).
//
// Every automatic match starts as "proposed". Nothing counts as linked until a person confirms it,
// assigns a unit, or the export is taken. The functions here are pure: they return new arrays and
// never touch the server. Saving confirmed links on the server is G-189, not part of this slice.
import type { BilingualMessage } from "@shared/projectErrors";
import type { DxfMatchReport, ProjectUnit } from "./dxfMatch";
import type { DxfDrawing } from "./dxfReader";

export type ReviewState = "proposed" | "confirmed" | "unlinked";

export type ReviewItem = {
  polygonId: string;
  layer: string;
  unitId: string | null;
  unitCode: string | null;
  state: ReviewState;
  // Why the polygon is not linked: a matcher reason code, or "rejected_by_reviewer". Null when linked.
  reason: string | null;
  // Units this polygon could belong to when the matcher could not decide.
  candidateUnitIds: string[];
};

export type ReviewErrorCode = "UNKNOWN_POLYGON" | "NOT_PROPOSED" | "UNIT_ALREADY_CONFIRMED";

export type ReviewError = { code: ReviewErrorCode; message: BilingualMessage };

export type ReviewResult = { ok: true; items: ReviewItem[] } | { ok: false; error: ReviewError };

const ERRORS: Record<ReviewErrorCode, BilingualMessage> = {
  UNKNOWN_POLYGON: {
    ar: "هذا الشكل غير موجود في الرسم.",
    en: "This shape is not in the drawing.",
    ur: "This shape is not in the drawing.",
  },
  NOT_PROPOSED: {
    ar: "لا يمكن تأكيد هذا الربط لأنه ليس اقتراحًا من المطابقة.",
    en: "This link cannot be confirmed because it is not a proposal from the matcher.",
    ur: "This link cannot be confirmed because it is not a proposal from the matcher.",
  },
  UNIT_ALREADY_CONFIRMED: {
    ar: "هذه الوحدة مربوطة بشكل آخر مؤكَّد. ألغِ ذلك الربط أولًا.",
    en: "This unit is already confirmed on another shape. Clear that link first.",
    ur: "This unit is already confirmed on another shape. Clear that link first.",
  },
};

export function buildReview(drawing: DxfDrawing, report: DxfMatchReport): ReviewItem[] {
  const items = new Map<string, ReviewItem>();
  for (const polygon of drawing.polygons) {
    items.set(polygon.id, { polygonId: polygon.id, layer: polygon.layer, unitId: null, unitCode: null, state: "unlinked", reason: null, candidateUnitIds: [] });
  }
  for (const link of report.linked) {
    const item = items.get(link.polygonId);
    if (!item) continue;
    Object.assign(item, { state: "proposed", unitId: link.unitId, unitCode: link.code });
  }
  for (const unmatched of report.unmatched) {
    if (unmatched.kind !== "polygon") continue;
    const item = items.get(unmatched.polygonId);
    if (item) item.reason = unmatched.reason;
  }
  for (const ambiguous of report.ambiguous) {
    if (ambiguous.reason === "several_texts_in_polygon") {
      const item = items.get(ambiguous.polygonId);
      if (item) item.reason = ambiguous.reason;
    } else if (ambiguous.reason === "duplicate_unit_code") {
      const item = items.get(ambiguous.polygonId);
      if (item) Object.assign(item, { reason: ambiguous.reason, unitCode: ambiguous.code, candidateUnitIds: [...ambiguous.unitIds] });
    } else {
      for (const polygonId of ambiguous.polygonIds) {
        const item = items.get(polygonId);
        if (item) Object.assign(item, { reason: ambiguous.reason, candidateUnitIds: [ambiguous.unitId] });
      }
    }
  }
  return Array.from(items.values());
}

function replaceItem(items: ReviewItem[], polygonId: string, change: (item: ReviewItem) => ReviewItem): ReviewResult {
  const index = items.findIndex(item => item.polygonId === polygonId);
  if (index < 0) return { ok: false, error: { code: "UNKNOWN_POLYGON", message: ERRORS.UNKNOWN_POLYGON } };
  const next = [...items];
  next[index] = change(items[index]);
  return { ok: true, items: next };
}

function confirmedOnOtherShape(items: ReviewItem[], unitId: string, polygonId: string): boolean {
  return items.some(item => item.state === "confirmed" && item.unitId === unitId && item.polygonId !== polygonId);
}

export function confirmLink(items: ReviewItem[], polygonId: string): ReviewResult {
  const current = items.find(item => item.polygonId === polygonId);
  if (!current) return { ok: false, error: { code: "UNKNOWN_POLYGON", message: ERRORS.UNKNOWN_POLYGON } };
  if (current.state !== "proposed" || !current.unitId) return { ok: false, error: { code: "NOT_PROPOSED", message: ERRORS.NOT_PROPOSED } };
  if (confirmedOnOtherShape(items, current.unitId, polygonId)) return { ok: false, error: { code: "UNIT_ALREADY_CONFIRMED", message: ERRORS.UNIT_ALREADY_CONFIRMED } };
  return replaceItem(items, polygonId, item => ({ ...item, state: "confirmed", reason: null, candidateUnitIds: [] }));
}

export function assignUnit(items: ReviewItem[], polygonId: string, unit: ProjectUnit): ReviewResult {
  if (confirmedOnOtherShape(items, unit.id, polygonId)) return { ok: false, error: { code: "UNIT_ALREADY_CONFIRMED", message: ERRORS.UNIT_ALREADY_CONFIRMED } };
  return replaceItem(items, polygonId, item => ({ ...item, state: "confirmed", unitId: unit.id, unitCode: unit.code, reason: null, candidateUnitIds: [] }));
}

export function rejectLink(items: ReviewItem[], polygonId: string): ReviewResult {
  return replaceItem(items, polygonId, item => ({ ...item, state: "unlinked", unitId: null, unitCode: null, reason: "rejected_by_reviewer", candidateUnitIds: [] }));
}

export function clearLink(items: ReviewItem[], polygonId: string): ReviewResult {
  return replaceItem(items, polygonId, item => ({ ...item, state: "unlinked", unitId: null, unitCode: null, reason: null, candidateUnitIds: [] }));
}

export type ReviewSummary = {
  polygons: number;
  confirmed: number;
  proposed: number;
  unlinked: number;
  unitsTotal: number;
  unitsConfirmed: number;
  unitsRemaining: number;
};

export function summarizeReview(items: ReviewItem[], units: ProjectUnit[]): ReviewSummary {
  const confirmed = items.filter(item => item.state === "confirmed");
  const confirmedUnitIds = new Set(confirmed.map(item => item.unitId));
  const unitsConfirmed = units.filter(unit => confirmedUnitIds.has(unit.id)).length;
  return {
    polygons: items.length,
    confirmed: confirmed.length,
    proposed: items.filter(item => item.state === "proposed").length,
    unlinked: items.filter(item => item.state === "unlinked").length,
    unitsTotal: units.length,
    unitsConfirmed,
    unitsRemaining: units.length - unitsConfirmed,
  };
}

// Only confirmed links leave the editor. Proposals and unlinked shapes are not exported.
export function confirmedLinks(items: ReviewItem[]): { polygonId: string; unitId: string; unitCode: string }[] {
  return items
    .filter(item => item.state === "confirmed" && item.unitId && item.unitCode)
    .map(item => ({ polygonId: item.polygonId, unitId: item.unitId as string, unitCode: item.unitCode as string }))
    .sort((a, b) => a.unitCode.localeCompare(b.unitCode));
}

// Spreadsheet programs run a cell that starts with = + - @ or a tab/CR as a formula. Prefix those cells with an apostrophe.
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportLinksCsv(items: ReviewItem[]): string {
  const rows = confirmedLinks(items).map(link => [link.polygonId, link.unitCode, link.unitId].map(csvCell).join(","));
  return ["polygon_id,unit_code,unit_id", ...rows].join("\n") + "\n";
}

export function exportLinksJson(items: ReviewItem[]): string {
  return JSON.stringify({ links: confirmedLinks(items) }, null, 2) + "\n";
}

// Colour by unit status, from masterPlanSpatialEntities.status. Proposed and unlinked shapes get fixed neutral
// colours so a reviewer can tell them apart from confirmed status colours. Status is also written as text beside the map.
export const UNIT_STATUS_COLOUR: Record<string, string> = {
  not_started: "#94a3b8",
  in_progress: "#d97706",
  completed: "#0e6b70",
  blocked: "#D62839",
};
export const PROPOSED_COLOUR = "#bfdbfe";
export const UNLINKED_COLOUR = "#e5e7eb";
const FALLBACK_STATUS_COLOUR = "#94a3b8";

export function polygonFill(item: ReviewItem, unitStatus: string | null): string {
  if (item.state === "proposed") return PROPOSED_COLOUR;
  if (item.state === "unlinked") return UNLINKED_COLOUR;
  return (unitStatus && UNIT_STATUS_COLOUR[unitStatus]) || FALLBACK_STATUS_COLOUR;
}
