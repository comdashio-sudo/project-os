// Who may approve a payment. The payment module itself does not exist yet; this is the rule it will call (AFTER_MIGRATION R-2, R-D).
// The accountant prepares a payment (payment.prepare); the finance manager approves it (payment.approve). The same person must not do
// both to one payment, whatever roles they hold. This is a pure function: it reads no database and changes nothing.

export const PAYMENT_SELF_APPROVAL_FORBIDDEN = "PROJECT_OS_PAYMENT_SELF_APPROVAL_FORBIDDEN" as const;

export type PaymentApprovalDecision =
  | { allowed: true }
  | { allowed: false; code: typeof PAYMENT_SELF_APPROVAL_FORBIDDEN };

export function decidePaymentApproval(input: { preparedByUserId: number | string; approvedByUserId: number | string }): PaymentApprovalDecision {
  // Compare as text: user ids reach this function as numbers from the session and as strings from the rows.
  if (String(input.preparedByUserId) === String(input.approvedByUserId)) return { allowed: false, code: PAYMENT_SELF_APPROVAL_FORBIDDEN };
  return { allowed: true };
}
