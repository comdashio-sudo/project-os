import { describe, expect, it } from "vitest";
import { decidePaymentApproval, PAYMENT_SELF_APPROVAL_FORBIDDEN } from "./paymentApproval";

describe("payment approval separation", () => {
  it("refuses approval by the same user who prepared the payment, with the named code", () => {
    expect(decidePaymentApproval({ preparedByUserId: 7, approvedByUserId: 7 })).toEqual({ allowed: false, code: "PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN" });
    expect(PAYMENT_SELF_APPROVAL_FORBIDDEN).toBe("PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN");
  });

  it("compares ids across number and string forms, so the same person is caught either way", () => {
    expect(decidePaymentApproval({ preparedByUserId: 7, approvedByUserId: "7" }).allowed).toBe(false);
    expect(decidePaymentApproval({ preparedByUserId: "uuid-a", approvedByUserId: "uuid-a" }).allowed).toBe(false);
  });

  it("allows approval by a different user (the positive case)", () => {
    expect(decidePaymentApproval({ preparedByUserId: 7, approvedByUserId: 8 })).toEqual({ allowed: true });
    expect(decidePaymentApproval({ preparedByUserId: "uuid-a", approvedByUserId: "uuid-b" })).toEqual({ allowed: true });
  });
});
