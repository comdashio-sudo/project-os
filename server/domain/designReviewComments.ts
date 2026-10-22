// The lifecycle of one design review comment (work order 5, item 7): the rules that need no database. The statuses and the transitions come
// from designCoordination.ts. The service (server/designService.ts) applies these rules inside transactions.
//
// Assumptions, documented because the schema does not state them:
//  - "responded" means a response text and a responder (respondedByUserId) are recorded. A response is required before a comment is closed,
//    except for a minor comment, which may be closed straight from open (an edge commentTransitions does not have; this module adds it).
//  - A major comment is treated like a critical one for the response rule: the brief names only critical and minor, and the safer reading is kept.
//  - The "closer is not the responder" rule is stated for critical comments, as the brief asks. The current service also refuses it for every
//    severity; this module does not relax that, the service stays as it is.

import { COMMENT_SEVERITIES, commentTransitions, type CommentStatus } from "./designCoordination";

export type CommentSeverity = (typeof COMMENT_SEVERITIES)[number];
export type ActorId = number | string;

export type CommentState = {
  status: CommentStatus;
  severity: CommentSeverity;
  /** true once a response text is recorded (the comment has been answered at least once) */
  responseRecorded: boolean;
  /** the person who recorded the response, or null when none is recorded */
  respondedById: ActorId | null;
};

export type CommentRefusal = "COMMENT_TRANSITION_INVALID" | "COMMENT_RESPONSE_REQUIRED" | "COMMENT_SELF_CLOSE" | "COMMENT_REOPEN_REASON_REQUIRED";

/** Closing needs a recorded response, except for a minor comment. */
export function canCloseWithoutResponse(severity: CommentSeverity): boolean {
  return severity === "minor";
}

/** Ids are compared as text, so a number from the database and the same id as text are the same person. */
export function sameActor(a: ActorId, b: ActorId): boolean {
  return String(a) === String(b);
}

/**
 * The closer must not be the person who wrote the response, for a critical comment: the one who answered cannot also accept the answer.
 * With no response recorded there is no responder, so nothing is refused on this ground.
 */
export function isSelfClosureRefused(severity: CommentSeverity, respondedById: ActorId | null, closerId: ActorId): boolean {
  return severity === "critical" && respondedById !== null && sameActor(respondedById, closerId);
}

/** The statuses a comment may move to from where it stands: the shared table, plus the minor-only close straight from open. */
export function allowedCommentTargets(comment: Pick<CommentState, "status" | "severity">): readonly CommentStatus[] {
  const targets = commentTransitions[comment.status];
  if (comment.status === "open" && canCloseWithoutResponse(comment.severity) && !targets.includes("closed")) return [...targets, "closed"];
  return targets;
}

export type CommentTransitionOptions = {
  /** the person making the move */
  actorId: ActorId;
  /** required when moving to responded (the answer) */
  responseText?: string | null;
  /** required when reopening a responded comment (why the answer is refused) */
  reopenReason?: string | null;
};

/**
 * Decides whether a comment may move to the next status, and why not. Order of the checks: the response rule first (it names the real
 * reason for a close that has no answer), then the table, then the closer rule, then the text that a reopen or a response needs.
 */
export function checkCommentTransition(comment: CommentState, nextStatus: CommentStatus, options: CommentTransitionOptions): { ok: true } | { ok: false; code: CommentRefusal } {
  if (nextStatus === "closed" && comment.status === "open" && !canCloseWithoutResponse(comment.severity)) return { ok: false, code: "COMMENT_RESPONSE_REQUIRED" };
  if (!allowedCommentTargets(comment).includes(nextStatus)) return { ok: false, code: "COMMENT_TRANSITION_INVALID" };
  if (nextStatus === "responded" && !options.responseText?.trim()) return { ok: false, code: "COMMENT_RESPONSE_REQUIRED" };
  if (nextStatus === "closed") {
    if (!comment.responseRecorded && !canCloseWithoutResponse(comment.severity)) return { ok: false, code: "COMMENT_RESPONSE_REQUIRED" };
    if (isSelfClosureRefused(comment.severity, comment.respondedById, options.actorId)) return { ok: false, code: "COMMENT_SELF_CLOSE" };
  }
  if (nextStatus === "open" && !options.reopenReason?.trim()) return { ok: false, code: "COMMENT_REOPEN_REASON_REQUIRED" };
  return { ok: true };
}
