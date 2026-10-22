import { describe, expect, it } from "vitest";
import { checkCommentTransition, allowedCommentTargets, canCloseWithoutResponse, isSelfClosureRefused, sameActor, type CommentState } from "./designReviewComments";

const open = (severity: CommentState["severity"]): CommentState => ({ status: "open", severity, responseRecorded: false, respondedById: null });
const responded = (severity: CommentState["severity"], respondedById: CommentState["respondedById"] = 7): CommentState => ({ status: "responded", severity, responseRecorded: true, respondedById });
const closed = (severity: CommentState["severity"]): CommentState => ({ status: "closed", severity, responseRecorded: true, respondedById: 7 });

describe("the response rule for closing", () => {
  it("lets a minor comment close without a response, and nothing else", () => {
    expect(canCloseWithoutResponse("minor")).toBe(true);
    expect(canCloseWithoutResponse("major")).toBe(false);
    expect(canCloseWithoutResponse("critical")).toBe(false);
  });

  it("refuses to close a critical comment that has no response, and says so", () => {
    expect(checkCommentTransition(open("critical"), "closed", { actorId: 9 })).toEqual({ ok: false, code: "COMMENT_RESPONSE_REQUIRED" });
  });

  it("refuses to close a major comment without a response too (the safer reading the brief left open)", () => {
    expect(checkCommentTransition(open("major"), "closed", { actorId: 9 })).toEqual({ ok: false, code: "COMMENT_RESPONSE_REQUIRED" });
  });

  it("closes a minor comment straight from open, and only a minor one", () => {
    expect(allowedCommentTargets(open("minor"))).toEqual(["responded", "closed"]);
    expect(allowedCommentTargets(open("critical"))).toEqual(["responded"]);
    expect(checkCommentTransition(open("minor"), "closed", { actorId: 9 })).toEqual({ ok: true });
  });

  it("closes a responded comment of any severity when the closer is not the responder", () => {
    expect(checkCommentTransition(responded("critical"), "closed", { actorId: 9 })).toEqual({ ok: true });
    expect(checkCommentTransition(responded("major"), "closed", { actorId: 9 })).toEqual({ ok: true });
  });
});

describe("the closer is not the responder for a critical comment", () => {
  it("refuses a critical comment closed by the person who wrote its response", () => {
    expect(checkCommentTransition(responded("critical", 7), "closed", { actorId: 7 })).toEqual({ ok: false, code: "COMMENT_SELF_CLOSE" });
  });

  it("compares ids as text, so the number 7 and the text '7' are the same person", () => {
    expect(checkCommentTransition(responded("critical", 7), "closed", { actorId: "7" })).toEqual({ ok: false, code: "COMMENT_SELF_CLOSE" });
    expect(isSelfClosureRefused("critical", "7", 7)).toBe(true);
    expect(sameActor(7, "7")).toBe(true);
    expect(sameActor(7, 8)).toBe(false);
  });

  it("allows the same person to close a major or minor comment they answered (the rule is stated for critical, as the brief asks)", () => {
    expect(isSelfClosureRefused("major", 7, 7)).toBe(false);
    expect(isSelfClosureRefused("minor", 7, 7)).toBe(false);
    expect(checkCommentTransition(responded("major", 7), "closed", { actorId: 7 })).toEqual({ ok: true });
  });

  it("does not refuse when there is no responder recorded, or a different person closes it", () => {
    expect(isSelfClosureRefused("critical", null, 7)).toBe(false);
    expect(isSelfClosureRefused("critical", 7, 9)).toBe(false);
  });
});

describe("responding", () => {
  it("records a response from open, when the text is not empty", () => {
    expect(checkCommentTransition(open("critical"), "responded", { actorId: 3, responseText: "Detail updated" })).toEqual({ ok: true });
  });

  it("refuses a response with no text, or with only spaces", () => {
    expect(checkCommentTransition(open("minor"), "responded", { actorId: 3 })).toEqual({ ok: false, code: "COMMENT_RESPONSE_REQUIRED" });
    expect(checkCommentTransition(open("minor"), "responded", { actorId: 3, responseText: "   " })).toEqual({ ok: false, code: "COMMENT_RESPONSE_REQUIRED" });
  });
});

describe("reopening", () => {
  it("reopens only from responded, and only with a reason", () => {
    expect(checkCommentTransition(responded("major"), "open", { actorId: 9, reopenReason: "The answer does not show the clash is solved" })).toEqual({ ok: true });
  });

  it("refuses a reopen with no reason, or with a blank one", () => {
    expect(checkCommentTransition(responded("major"), "open", { actorId: 9 })).toEqual({ ok: false, code: "COMMENT_REOPEN_REASON_REQUIRED" });
    expect(checkCommentTransition(responded("major"), "open", { actorId: 9, reopenReason: "  " })).toEqual({ ok: false, code: "COMMENT_REOPEN_REASON_REQUIRED" });
  });

  it("refuses a reopen from open or from closed, with the transition code", () => {
    expect(checkCommentTransition(open("major"), "open", { actorId: 9, reopenReason: "why" })).toEqual({ ok: false, code: "COMMENT_TRANSITION_INVALID" });
    expect(checkCommentTransition(closed("major"), "open", { actorId: 9, reopenReason: "why" })).toEqual({ ok: false, code: "COMMENT_TRANSITION_INVALID" });
  });
});

describe("transitions that the table does not allow", () => {
  it("refuses any move out of closed", () => {
    for (const next of ["open", "responded", "closed"] as const) expect(checkCommentTransition(closed("minor"), next, { actorId: 9, responseText: "x", reopenReason: "x" })).toEqual({ ok: false, code: "COMMENT_TRANSITION_INVALID" });
  });

  it("refuses a move to the status it is already in", () => {
    expect(checkCommentTransition(responded("major"), "responded", { actorId: 9, responseText: "again" })).toEqual({ ok: false, code: "COMMENT_TRANSITION_INVALID" });
  });

  it("reports a critical open comment closed as the missing response, not as an invalid move", () => {
    expect(checkCommentTransition(open("critical"), "closed", { actorId: 9 })).toEqual({ ok: false, code: "COMMENT_RESPONSE_REQUIRED" });
  });
});
