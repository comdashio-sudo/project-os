// Q-55 batch 3 (b): the demonstration company's contractor work confirmations and the claim they feed, written through the platform's own procedures (the
// same checks, separation of duties and audit rows as the screens): the site engineer confirms what the finishing contractor did (SC-002, the subcontract with
// no certificate open), the contracts manager — not the preparer — approves two, sends one back with its reason and leaves one waiting, then pulls the two
// approved into a draft certificate priced from the BOQ. Everything is obviously made up: notes end in «(عرض)». Called from seedDemoCompany once the people's
// memberships are active; the erasure removes it with the company.

type Caller = {
  workConfirmations: {
    options(input: Record<string, unknown>): Promise<{ boqItems: Array<{ id: string; code: string }> }>;
    create(input: Record<string, unknown>): Promise<{ id: string }>;
    transition(input: Record<string, unknown>): Promise<unknown>;
  };
  subcontracts: { createCertificate(input: Record<string, unknown>): Promise<unknown> };
};

// number, days ago (period end), period length in days, BOQ codes with the quantities confirmed, what becomes of it
const CONFIRMATIONS = [
  { number: "WC-001", endAgo: 28, days: 14, lines: [["BOQ-08", 12], ["BOQ-09", 9]], outcome: "approved", note: "بلاط الأرضيات للمجموعات 3 و4 (عرض)" },
  { number: "WC-002", endAgo: 14, days: 14, lines: [["BOQ-08", 15], ["BOQ-09", 11]], outcome: "approved", note: "بلاط ودهان المجموعات 5 و6 (عرض)" },
  { number: "WC-003", endAgo: 7, days: 7, lines: [["BOQ-09", 30]], outcome: "rejected", note: "دهان المجموعة 7 (عرض)", reason: "الكمية تتجاوز ما رآه المهندس في الموقع؛ أعد القياس (عرض)" },
  { number: "WC-004", endAgo: 1, days: 6, lines: [["BOQ-08", 8]], outcome: "submitted", note: "بلاط المجموعة 8 (عرض)" },
] as const;

export async function seedWorkConfirmations(input: {
  tenantId: string; projectId: string; subcontractId: string; now: Date;
  callerOf: (key: "site1" | "contracts") => Caller; log: (message: string) => void;
}) {
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const ymd = (daysAgo: number) => new Date(input.now.getTime() + 3 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const site = input.callerOf("site1"); const contracts = input.callerOf("contracts");
  const boq = new Map((await site.workConfirmations.options(scope)).boqItems.map(item => [item.code, item.id]));
  const approved: string[] = [];
  let first = ""; let last = "";
  for (const item of CONFIRMATIONS) {
    const periodStart = ymd(item.endAgo + item.days - 1); const periodEnd = ymd(item.endAgo);
    const lines = item.lines.map(([code, quantity]) => {
      const boqItemId = boq.get(code);
      if (!boqItemId) throw new Error(`demo: BOQ item ${code} is missing`);
      return { kind: "quantity" as const, boqItemId, quantity };
    });
    const { id } = await site.workConfirmations.create({ ...scope, subcontractId: input.subcontractId, confirmationNumber: item.number, periodStart, periodEnd, note: item.note, lines });
    await site.workConfirmations.transition({ ...scope, confirmationId: id, nextStatus: "submitted" });
    if (item.outcome === "approved") {
      await contracts.workConfirmations.transition({ ...scope, confirmationId: id, nextStatus: "approved" });
      approved.push(id);
      first ||= periodStart; last = periodEnd;
    } else if (item.outcome === "rejected") {
      await contracts.workConfirmations.transition({ ...scope, confirmationId: id, nextStatus: "rejected", reason: item.reason });
    }
  }
  // the two approved pulled into one draft certificate: one line per BOQ item, priced from the BOQ by the server
  await contracts.subcontracts.createCertificate({ ...scope, subcontractId: input.subcontractId, certificateNumber: "IPC-004", periodStart: new Date(`${first}T00:00:00Z`), periodEnd: new Date(`${last}T00:00:00Z`), lines: [], confirmationIds: approved });
  input.log(`work confirmations: ${CONFIRMATIONS.length} on SC-002 (${approved.length} approved and pulled into IPC-004, 1 sent back, 1 waiting)`);
  return { confirmations: CONFIRMATIONS.length, approved: approved.length, certificate: "IPC-004" };
}
