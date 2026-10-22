// The consultant reply cycle of one submittal (work order 5, item 7): the rules that need no database. The reply codes (A, B, C, D) and the
// rules on work and resubmission come from designCoordination.ts. The service (server/designService.ts) applies these rules inside transactions.
//
// Submittal numbers: a resubmission keeps the chain of its original and adds "-R<n>": "SUB-001" is the first submittal, "SUB-001-R1" its first
// resubmission, "SUB-001-R2" the next. The existing service already uses this pattern in its tests, so it is kept. Two rules are added here
// that the service does not yet state: one resubmission per returned reply (C or D), and no closing of a C or D chain before its resubmission.

import { replyAllowsWork, replyRequiresResubmission, SUBMITTAL_REPLY_CODES, type SubmittalReplyCode, type SubmittalStatus } from "./designCoordination";

/** draft -> submitted (sent to the consultant) -> replied (exactly one code) -> closed. Nothing leaves closed. */
export const submittalTransitions: Record<SubmittalStatus, readonly SubmittalStatus[]> = { draft: ["submitted"], submitted: ["replied"], replied: ["closed"], closed: [] };

export type ActorId = number | string;
export type SubmittalState = {
  status: SubmittalStatus;
  /** the reply code, once one is recorded; null before that */
  replyCode: SubmittalReplyCode | null;
  /** the person who sent the submittal, or null when not yet sent */
  submittedById: ActorId | null;
};

export type SubmittalRefusal =
  | "SUBMITTAL_TRANSITION_INVALID"
  | "SUBMITTAL_REPLY_ALREADY_RECORDED"
  | "SUBMITTAL_REPLY_CODE_INVALID"
  | "SUBMITTAL_SELF_REPLY"
  | "SUBMITTAL_RESUBMISSION_REQUIRED"
  | "SUBMITTAL_RESUBMISSION_INVALID"
  | "SUBMITTAL_RESUBMISSION_EXISTS";

/** The number of a submittal's chain and its resubmission count: "SUB-001-R2" is chain "SUB-001" at 2; a number without a suffix is at 0. */
export function submittalChain(number: string): { base: string; revision: number } {
  const match = /^(.+)-R([1-9]\d*)$/.exec(number);
  return match ? { base: match[1], revision: Number(match[2]) } : { base: number, revision: 0 };
}

/**
 * The number of the next resubmission in the chain of `original`: one above the highest number of that chain, so a gap is not filled and
 * nothing is reused. Numbers of other chains are ignored. Pass every number of the project; a number not passed cannot be avoided.
 */
export function nextResubmissionNumber(original: string, chainNumbers: readonly string[]): string {
  const { base } = submittalChain(original);
  let highest = 0;
  for (const number of [original, ...chainNumbers]) {
    const chain = submittalChain(number);
    if (chain.base === base) highest = Math.max(highest, chain.revision);
  }
  return `${base}-R${highest + 1}`;
}

/** Whether a submittal may move to the next status, and if not, why. Replying twice gets its own code, not the generic one. */
export function checkSubmittalTransition(from: SubmittalStatus, to: SubmittalStatus): { ok: true } | { ok: false; code: SubmittalRefusal } {
  if (to === "replied" && (from === "replied" || from === "closed")) return { ok: false, code: "SUBMITTAL_REPLY_ALREADY_RECORDED" };
  if (!submittalTransitions[from]?.includes(to)) return { ok: false, code: "SUBMITTAL_TRANSITION_INVALID" };
  return { ok: true };
}

function isReplyCode(value: string): value is SubmittalReplyCode {
  return (SUBMITTAL_REPLY_CODES as readonly string[]).includes(value);
}

/**
 * Records the consultant's reply: from submitted only, with exactly one valid code, and not by the person who sent the submittal (the
 * service's rule, kept here). The result says whether the work may go ahead (A, B) and whether a resubmission is needed (C, D).
 */
export function recordSubmittalReply(state: SubmittalState, reply: { code: string; actorId: ActorId }):
  | { ok: true; status: "replied"; replyCode: SubmittalReplyCode; allowsWork: boolean; requiresResubmission: boolean }
  | { ok: false; code: SubmittalRefusal } {
  const transition = checkSubmittalTransition(state.status, "replied");
  if (!transition.ok) return transition;
  if (!isReplyCode(reply.code)) return { ok: false, code: "SUBMITTAL_REPLY_CODE_INVALID" };
  if (state.submittedById !== null && String(state.submittedById) === String(reply.actorId)) return { ok: false, code: "SUBMITTAL_SELF_REPLY" };
  return { ok: true, status: "replied", replyCode: reply.code, allowsWork: replyAllowsWork(reply.code), requiresResubmission: replyRequiresResubmission(reply.code) };
}

/** A C or D chain closes only once its resubmission exists (the caller says whether one does). An A or B chain closes at once. */
export function closeSubmittal(state: SubmittalState, resubmissionExists: boolean): { ok: true; status: "closed" } | { ok: false; code: SubmittalRefusal } {
  const transition = checkSubmittalTransition(state.status, "closed");
  if (!transition.ok) return transition;
  if (state.replyCode !== null && replyRequiresResubmission(state.replyCode) && !resubmissionExists) return { ok: false, code: "SUBMITTAL_RESUBMISSION_REQUIRED" };
  return { ok: true, status: "closed" };
}

/**
 * A resubmission is made only for a submittal the consultant sent back (C or D), once its reply is recorded, and only one per reply. A and B
 * were accepted, so there is nothing to resubmit.
 */
export function checkResubmission(state: SubmittalState, resubmissionExists: boolean): { ok: true } | { ok: false; code: SubmittalRefusal } {
  if (state.status !== "replied" && state.status !== "closed") return { ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" };
  if (state.replyCode === null || !replyRequiresResubmission(state.replyCode)) return { ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" };
  if (resubmissionExists) return { ok: false, code: "SUBMITTAL_RESUBMISSION_EXISTS" };
  return { ok: true };
}
