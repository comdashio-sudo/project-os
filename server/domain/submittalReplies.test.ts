import { describe, expect, it } from "vitest";
import { SUBMITTAL_STATUSES } from "./designCoordination";
import { checkResubmission, checkSubmittalTransition, closeSubmittal, nextResubmissionNumber, recordSubmittalReply, submittalChain, submittalTransitions, type SubmittalState } from "./submittalReplies";

const draft: SubmittalState = { status: "draft", replyCode: null, submittedById: null };
const submitted: SubmittalState = { status: "submitted", replyCode: null, submittedById: 4 };
const replied = (code: SubmittalState["replyCode"]): SubmittalState => ({ status: "replied", replyCode: code, submittedById: 4 });

describe("submittal status flow", () => {
  it("has a transition entry for each status, and goes draft, submitted, replied, closed", () => {
    expect(Object.keys(submittalTransitions).sort()).toEqual([...SUBMITTAL_STATUSES].sort());
    expect(checkSubmittalTransition("draft", "submitted")).toEqual({ ok: true });
    expect(checkSubmittalTransition("submitted", "replied")).toEqual({ ok: true });
    expect(checkSubmittalTransition("replied", "closed")).toEqual({ ok: true });
  });

  it("refuses to reply to a submittal that has not been sent, and to skip a step", () => {
    expect(checkSubmittalTransition("draft", "replied")).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(checkSubmittalTransition("submitted", "closed")).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(checkSubmittalTransition("replied", "submitted")).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
  });

  it("refuses a second reply, from replied or from closed, with its own code", () => {
    expect(checkSubmittalTransition("replied", "replied")).toEqual({ ok: false, code: "SUBMITTAL_REPLY_ALREADY_RECORDED" });
    expect(checkSubmittalTransition("closed", "replied")).toEqual({ ok: false, code: "SUBMITTAL_REPLY_ALREADY_RECORDED" });
  });

  it("nothing leaves closed", () => {
    expect(checkSubmittalTransition("closed", "submitted")).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(checkSubmittalTransition("closed", "closed")).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
  });
});

describe("recording the consultant's reply", () => {
  it("records exactly one code, from submitted, and says whether the work may go ahead", () => {
    expect(recordSubmittalReply(submitted, { code: "A", actorId: 9 })).toEqual({ ok: true, status: "replied", replyCode: "A", allowsWork: true, requiresResubmission: false });
    expect(recordSubmittalReply(submitted, { code: "B", actorId: 9 })).toEqual({ ok: true, status: "replied", replyCode: "B", allowsWork: true, requiresResubmission: false });
  });

  it("says that C and D send the work back for a resubmission, and does not allow the work", () => {
    expect(recordSubmittalReply(submitted, { code: "C", actorId: 9 })).toEqual({ ok: true, status: "replied", replyCode: "C", allowsWork: false, requiresResubmission: true });
    expect(recordSubmittalReply(submitted, { code: "D", actorId: 9 })).toEqual({ ok: true, status: "replied", replyCode: "D", allowsWork: false, requiresResubmission: true });
  });

  it("refuses a reply on a draft (not yet sent), and a second reply on one already answered", () => {
    expect(recordSubmittalReply(draft, { code: "A", actorId: 9 })).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(recordSubmittalReply(replied("A"), { code: "B", actorId: 9 })).toEqual({ ok: false, code: "SUBMITTAL_REPLY_ALREADY_RECORDED" });
    expect(recordSubmittalReply({ ...replied("C"), status: "closed" }, { code: "A", actorId: 9 })).toEqual({ ok: false, code: "SUBMITTAL_REPLY_ALREADY_RECORDED" });
  });

  it("refuses a code that is not A, B, C or D, including lower case and a combined code", () => {
    for (const code of ["a", "E", "AB", "", "C "]) expect(recordSubmittalReply(submitted, { code, actorId: 9 })).toEqual({ ok: false, code: "SUBMITTAL_REPLY_CODE_INVALID" });
  });

  it("refuses a reply by the person who sent the submittal, and compares ids as text", () => {
    expect(recordSubmittalReply(submitted, { code: "A", actorId: 4 })).toEqual({ ok: false, code: "SUBMITTAL_SELF_REPLY" });
    expect(recordSubmittalReply(submitted, { code: "A", actorId: "4" })).toEqual({ ok: false, code: "SUBMITTAL_SELF_REPLY" });
    expect(recordSubmittalReply(submitted, { code: "A", actorId: 5 })).toEqual({ ok: true, status: "replied", replyCode: "A", allowsWork: true, requiresResubmission: false });
  });
});

describe("closing a submittal", () => {
  it("closes an A or B chain at once, with or without a resubmission", () => {
    expect(closeSubmittal(replied("A"), false)).toEqual({ ok: true, status: "closed" });
    expect(closeSubmittal(replied("B"), false)).toEqual({ ok: true, status: "closed" });
  });

  it("refuses to close a C or D chain until its resubmission exists", () => {
    expect(closeSubmittal(replied("C"), false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_REQUIRED" });
    expect(closeSubmittal(replied("D"), false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_REQUIRED" });
    expect(closeSubmittal(replied("C"), true)).toEqual({ ok: true, status: "closed" });
  });

  it("refuses to close a submittal that has not been replied to yet", () => {
    expect(closeSubmittal(submitted, false)).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(closeSubmittal(draft, true)).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
    expect(closeSubmittal({ ...replied("A"), status: "closed" }, true)).toEqual({ ok: false, code: "SUBMITTAL_TRANSITION_INVALID" });
  });
});

describe("resubmission", () => {
  it("is allowed once for a C or D reply, while the chain is replied or already closed", () => {
    expect(checkResubmission(replied("C"), false)).toEqual({ ok: true });
    expect(checkResubmission(replied("D"), false)).toEqual({ ok: true });
    expect(checkResubmission({ ...replied("C"), status: "closed" }, false)).toEqual({ ok: true });
  });

  it("is refused for an A or B reply: the work was accepted", () => {
    expect(checkResubmission(replied("A"), false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" });
    expect(checkResubmission(replied("B"), false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" });
  });

  it("is refused before a reply is recorded", () => {
    expect(checkResubmission(draft, false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" });
    expect(checkResubmission(submitted, false)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_INVALID" });
  });

  it("is refused a second time: one resubmission per returned reply", () => {
    expect(checkResubmission(replied("C"), true)).toEqual({ ok: false, code: "SUBMITTAL_RESUBMISSION_EXISTS" });
  });
});

describe("submittal numbers in a chain", () => {
  it("reads the chain of a number: a suffix -R<n> with n of 1 or more, and no suffix at 0", () => {
    expect(submittalChain("SUB-001")).toEqual({ base: "SUB-001", revision: 0 });
    expect(submittalChain("SUB-001-R2")).toEqual({ base: "SUB-001", revision: 2 });
    expect(submittalChain("SUB-R0")).toEqual({ base: "SUB-R0", revision: 0 });
    expect(submittalChain("SUB-001-R0")).toEqual({ base: "SUB-001-R0", revision: 0 });
  });

  it("the first resubmission of an original is -R1, and the next is one above the highest in the chain", () => {
    expect(nextResubmissionNumber("SUB-001", [])).toBe("SUB-001-R1");
    expect(nextResubmissionNumber("SUB-001", ["SUB-001-R1", "SUB-001-R2"])).toBe("SUB-001-R3");
  });

  it("does not fill a gap and does not reuse a number", () => {
    expect(nextResubmissionNumber("SUB-001", ["SUB-001-R4"])).toBe("SUB-001-R5");
    expect(nextResubmissionNumber("SUB-001", ["SUB-001-R1", "SUB-001-R3"])).toBe("SUB-001-R4");
  });

  it("a resubmission of a resubmission stays in the same chain", () => {
    expect(nextResubmissionNumber("SUB-001-R1", ["SUB-001", "SUB-001-R1"])).toBe("SUB-001-R2");
  });

  it("ignores the numbers of other chains, including ones that look close", () => {
    expect(nextResubmissionNumber("SUB-001", ["SUB-002-R5", "SUB-0010-R7", "SUB-001X-R9"])).toBe("SUB-001-R1");
  });
});
