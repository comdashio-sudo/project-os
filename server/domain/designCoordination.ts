// Technical and architectural coordination of a project's design phase (work order 5, item 7): the rules that do not need a database,
// so they can be tested alone and read by the screen as well. The service (server/designService.ts) applies them inside transactions.

import { DESIGN_DISCIPLINES, type DesignDiscipline } from "@shared/designDisciplines";
export { DESIGN_DISCIPLINES, type DesignDiscipline };

/**
 * Who may touch a drawing: `project.design.manage` says the person coordinates design at all; the discipline authority says WHICH drawings.
 * An architectural coordinator must not be able to re-issue the structural set, and the reverse. "other" is open to either.
 */
export const ARCHITECTURAL_DISCIPLINES: readonly DesignDiscipline[] = ["architectural", "interior", "landscape"];
export const TECHNICAL_DISCIPLINES: readonly DesignDiscipline[] = ["structural", "civil", "mechanical", "electrical", "plumbing", "fire_fighting"];

/** The permission(s) of which ANY one gives authority over a discipline (on top of project.design.manage). */
export function disciplineAuthority(discipline: DesignDiscipline): readonly string[] {
  if (ARCHITECTURAL_DISCIPLINES.includes(discipline)) return ["project.design.architectural"];
  if (TECHNICAL_DISCIPLINES.includes(discipline)) return ["project.design.technical"];
  return ["project.design.architectural", "project.design.technical"];
}

export const DRAWING_STATUSES = ["registered", "under_review", "approved", "cancelled"] as const;
export type DrawingStatus = (typeof DRAWING_STATUSES)[number];
export const COMMENT_STATUSES = ["open", "responded", "closed"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export const COMMENT_SEVERITIES = ["minor", "major", "critical"] as const;
export const TRANSMITTAL_DIRECTIONS = ["outgoing", "incoming"] as const;
export const TRANSMITTAL_STATUSES = ["draft", "sent", "acknowledged"] as const;
export type TransmittalStatus = (typeof TRANSMITTAL_STATUSES)[number];
export const SUBMITTAL_STATUSES = ["draft", "submitted", "replied", "closed"] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];
/** The consultant's reply: A approved · B approved as noted · C revise and resubmit · D rejected. */
export const SUBMITTAL_REPLY_CODES = ["A", "B", "C", "D"] as const;
export type SubmittalReplyCode = (typeof SUBMITTAL_REPLY_CODES)[number];

/** A and B let the work go ahead; C and D send it back (C to be corrected and resubmitted, D to be replaced). */
export const replyAllowsWork = (code: SubmittalReplyCode) => code === "A" || code === "B";
export const replyRequiresResubmission = (code: SubmittalReplyCode) => code === "C" || code === "D";

export const commentTransitions: Record<CommentStatus, readonly CommentStatus[]> = { open: ["responded"], responded: ["closed", "open"], closed: [] };
export const transmittalTransitions: Record<TransmittalStatus, readonly TransmittalStatus[]> = { draft: ["sent"], sent: ["acknowledged"], acknowledged: [] };

/** Shape of the dashboard's drawing-status rows (discipline × status counts), reduced to the numbers the screen shows. */
export function summariseDrawings(rows: ReadonlyArray<{ discipline: string; status: string; total: number }>) {
  const byDiscipline = new Map<string, { discipline: string; total: number; approved: number }>();
  const byStatus: Record<string, number> = { registered: 0, under_review: 0, approved: 0, cancelled: 0 };
  for (const row of rows) {
    const total = Number(row.total);
    byStatus[row.status] = (byStatus[row.status] ?? 0) + total;
    if (row.status === "cancelled") continue; // a cancelled drawing is not part of what the design phase has to deliver
    const entry = byDiscipline.get(row.discipline) ?? { discipline: row.discipline, total: 0, approved: 0 };
    entry.total += total;
    if (row.status === "approved") entry.approved += total;
    byDiscipline.set(row.discipline, entry);
  }
  const disciplines = Array.from(byDiscipline.values()).sort((a, b) => a.discipline.localeCompare(b.discipline));
  const total = disciplines.reduce((sum, item) => sum + item.total, 0);
  const approved = disciplines.reduce((sum, item) => sum + item.approved, 0);
  // no drawings is not "0% done" and not "100% done": the design phase has not been registered yet, so the screen says so (null)
  return { byStatus, disciplines, total, approved, completionPercent: total === 0 ? null : Math.round((approved / total) * 1000) / 10 };
}
