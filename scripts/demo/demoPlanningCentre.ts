// Q-55 batch 3 (b): the demonstration company's strategic planning centre, written through the platform's own procedures — twelve assumptions entered by the
// owner and approved by someone else (the separation of duties the server enforces), three competitors with their SWOT, five opportunities (one won, one lost),
// four goals and six initiatives. The approver is the made-up board member, given a «strategy approver» role the owner creates on the administration screen's
// own procedure. Everything is obviously made up: names end in «(عرض)», sources say they are the demonstration's own estimates, no link to a real site.
type Caller = {
  tenant: {
    createRole(input: Record<string, unknown>): Promise<{ id: string } | { roleId: string } | unknown>;
    assignMembershipRole(input: Record<string, unknown>): Promise<unknown>;
    administration(input: { tenantId: string }): Promise<{ roles: Array<{ id: string; code: string }> }>;
  };
  strategy: {
    createAssumption(input: Record<string, unknown>): Promise<{ id: string }>;
    submitAssumption(input: Record<string, unknown>): Promise<unknown>;
    decideAssumption(input: Record<string, unknown>): Promise<unknown>;
    createCompetitor(input: Record<string, unknown>): Promise<{ id: string }>;
    createSwot(input: Record<string, unknown>): Promise<unknown>;
    createOpportunity(input: Record<string, unknown>): Promise<{ id: string }>;
    decideOpportunity(input: Record<string, unknown>): Promise<unknown>;
    createGoal(input: Record<string, unknown>): Promise<{ id: string }>;
    createInitiative(input: Record<string, unknown>): Promise<unknown>;
  };
};

const SOURCE = "تقدير مختلق لشركة العرض (عرض)";
// code, name, unit, [conservative, base, optimistic], module, confidence, what happens to it
const ASSUMPTIONS = [
  ["A-WIN-RATE", "نسبة الفوز بالمناقصات (عرض)", "percent", [18, 25, 32], "general", "medium", "approve"],
  ["A-MARGIN", "هامش الربح الإجمالي للمشاريع السكنية (عرض)", "percent", [9, 12, 15], "general", "high", "approve"],
  ["A-OVERHEAD", "المصاريف العامة من الإيراد (عرض)", "percent", [7, 6, 5], "general", "high", "approve"],
  ["A-COLLECTION", "مدة التحصيل من العميل بالأيام (عرض)", "days", [90, 60, 45], "general", "medium", "approve"],
  ["A-DELAY", "متوسط تأخر المشاريع بالأشهر (عرض)", "months", [4, 2, 1], "general", "low", "approve"],
  ["A-NEW-PROJECTS", "عدد المشاريع الجديدة سنويًا (عرض)", "count", [2, 3, 5], "general", "medium", "approve"],
  ["M-DEMAND", "نمو الطلب على الفلل في المنطقة (عرض)", "percent", [3, 6, 9], "market", "medium", "approve"],
  ["M-STEEL", "تغير سعر الحديد خلال سنة (عرض)", "percent", [12, 6, 0], "market", "low", "approve"],
  ["M-CEMENT", "تغير سعر الأسمنت خلال سنة (عرض)", "percent", [8, 4, 0], "market", "medium", "approve"],
  ["M-LABOUR", "تكلفة العامل اليومية بالريال (عرض)", "sar", [190, 170, 160], "market", "medium", "approve"],
  ["M-UNIT-PRICE", "متوسط سعر بيع الفيلا بالريال (عرض)", "sar", [1_350_000, 1_500_000, 1_650_000], "market", "medium", "submit"],
  ["M-COMPETITION", "عدد المنافسين في كل مناقصة (عرض)", "count", [7, 5, 4], "market", "low", "draft"],
] as const;

const COMPETITORS = [
  { name: "شركة منافسة أ للمقاولات (عرض)", sector: "سكني", region: "المنطقة الوسطى", projectTypes: "فلل، مجمعات سكنية", sizeValue: 900_000_000, sizeEvidence: "estimate" },
  { name: "شركة منافسة ب للتطوير (عرض)", sector: "سكني وتجاري", region: "المنطقة الشرقية", projectTypes: "أبراج، فلل", sizeValue: 1_600_000_000, sizeEvidence: "analysis" },
  { name: "شركة منافسة ج للبناء (عرض)", sector: "سكني", region: "المنطقة الغربية", projectTypes: "فلل اقتصادية", sizeValue: 450_000_000, sizeEvidence: "estimate" },
] as const;

export async function seedPlanningCentre(input: {
  tenantId: string; now: Date; ownerCaller: Caller; approverCaller: Caller; approverMembershipId: string; ownerUserId: number; peopleIds: Record<string, number>; log: (message: string) => void;
}) {
  const { tenantId } = input;
  const ymd = (daysFromNow: number) => new Date(input.now.getTime() + 3 * 3_600_000 + daysFromNow * 86_400_000).toISOString().slice(0, 10);
  const owner = input.ownerCaller.strategy;

  // 1. the approver: the board member holds a «strategy approver» role (read and approve, nothing else), created and given by the owner
  await input.ownerCaller.tenant.createRole({ tenantId, code: "DEMO_STRATEGY_APPROVER", name: "معتمد الافتراضات الاستراتيجية (عرض)", productCode: "EXECUTIVE", permissionCodes: ["strategy.read", "strategy.approve"] });
  const roleId = (await input.ownerCaller.tenant.administration({ tenantId })).roles.find(role => role.code === "DEMO_STRATEGY_APPROVER")!.id;
  await input.ownerCaller.tenant.assignMembershipRole({ tenantId, membershipId: input.approverMembershipId, roleId, scopeType: "company" });

  // 2. twelve assumptions: ten approved, one waiting for the approver, one still a draft
  const assumptionIds = new Map<string, string>();
  for (const [code, name, unit, [conservative, base, optimistic], module, confidence, fate] of ASSUMPTIONS) {
    const created = await owner.createAssumption({ tenantId, code, name, unit, sourceType: module === "market" ? "external" : "management", sourceNote: SOURCE, confidence,
      reviewFrequency: module === "market" ? "quarterly" : "annual", nextReviewAt: ymd(module === "market" ? 60 : 200), values: { conservative, base, optimistic }, module,
      ...(module === "market" ? { evidence: "estimate" } : {}) });
    assumptionIds.set(code, created.id);
    if (fate === "draft") continue;
    await owner.submitAssumption({ tenantId, assumptionId: created.id });
    if (fate === "approve") await input.approverCaller.strategy.decideAssumption({ tenantId, assumptionId: created.id, decision: "approve" });
  }

  // 3. three competitors, a SWOT line on each and four on the company itself
  const competitorIds: string[] = [];
  for (const [index, competitor] of COMPETITORS.entries()) {
    const created = await owner.createCompetitor({ tenantId, ...competitor, sourceNote: SOURCE, collectedAt: ymd(-20 - index * 7) });
    competitorIds.push(created.id);
  }
  const swot: Array<[string, string, string, string | null, string | null]> = [
    ["strength", "سجل تسليم في الموعد لمشاريع الفلل (عرض)", "ثلاثة مشاريع سُلّمت في موعدها خلال سنتين (عرض)", null, null],
    ["weakness", "الاعتماد على مورد واحد للبلوك (عرض)", "تأخر توريد 4 أيام في الربع الأخير (عرض)", null, null],
    ["opportunity", "برامج الإسكان الحكومية في المنطقة (عرض)", "إعلان مختلق عن 3 مشاريع جديدة (عرض)", null, "M-DEMAND"],
    ["threat", "ارتفاع أسعار الحديد (عرض)", "الافتراض M-STEEL: ارتفاع 6% في الحالة الأساسية (عرض)", null, "M-STEEL"],
    ["strength", "حجم أكبر وقدرة تمويل أعلى (عرض)", "حجم أعمال تقديري 1.6 مليار (عرض)", "1", null],
    ["weakness", "تأخر متكرر في مشاريع الفلل (عرض)", "تقدير مختلق من متابعة السوق (عرض)", "0", null],
    ["threat", "أسعار منخفضة في الفلل الاقتصادية (عرض)", "عرضان مختلقان أقل بـ8% (عرض)", "2", null],
  ];
  for (const [kind, statement, evidence, competitor, assumption] of swot) {
    await owner.createSwot({ tenantId, kind, statement, evidence, competitorId: competitor === null ? null : competitorIds[Number(competitor)], assumptionId: assumption === null ? null : assumptionIds.get(assumption) ?? null });
  }

  // 4. five opportunities: three still open or submitted, one won, one lost to the second competitor
  const opportunities = [
    { code: "OP-201", name: "مجمع فلل الواحة (عرض)", clientName: "مطوّر عقاري (عرض)", estimatedValue: 320_000_000, probabilityPercent: 40, expectedAwardAt: ymd(60), durationMonths: 24, status: "submitted" },
    { code: "OP-202", name: "فلل الحي الشمالي (عرض)", clientName: "جهة إسكان (عرض)", estimatedValue: 180_000_000, probabilityPercent: 25, expectedAwardAt: ymd(120), durationMonths: 18, status: "open" },
    { code: "OP-203", name: "مرحلة ثانية لمشروع العرض (عرض)", clientName: "مالك المبنى (عرض)", estimatedValue: 260_000_000, probabilityPercent: 60, expectedAwardAt: ymd(45), durationMonths: 20, status: "submitted" },
    { code: "OP-198", name: "فلل الريف (عرض)", clientName: "مطوّر عقاري (عرض)", estimatedValue: 150_000_000, probabilityPercent: 50, expectedAwardAt: ymd(-40), durationMonths: 16, status: "submitted", decide: { outcome: "won", decidedAt: ymd(-35) } },
    { code: "OP-199", name: "مجمع البحيرة (عرض)", clientName: "جهة إسكان (عرض)", estimatedValue: 210_000_000, probabilityPercent: 35, expectedAwardAt: ymd(-25), durationMonths: 22, status: "submitted", decide: { outcome: "lost", decidedAt: ymd(-20), winnerCompetitor: 1, winningValue: 196_000_000 } },
  ] as const;
  for (const { decide, ...opportunity } of opportunities.map(item => ({ decide: undefined, ...item }))) {
    const created = await owner.createOpportunity({ tenantId, ...opportunity, sector: "سكني", region: "المنطقة الوسطى" });
    // the winner and its price are named only for one lost (the server's rule)
    if (decide) await owner.decideOpportunity({ tenantId, opportunityId: created.id, outcome: decide.outcome, decidedAt: decide.decidedAt, ...("winningValue" in decide ? { winningValue: decide.winningValue } : {}),
      ...("winnerCompetitor" in decide ? { winnerCompetitorId: competitorIds[decide.winnerCompetitor] } : {}), note: "نتيجة مختلقة للعرض (عرض)" });
  }

  // 5. four goals for the year, and six initiatives that serve them, each with its owner
  const year = Number(ymd(0).slice(0, 4));
  const goals = [
    { code: "G-1", name: "رفع نسبة الفوز بالمناقصات (عرض)", unit: "percent", targetValue: 30, assumption: "A-WIN-RATE" },
    { code: "G-2", name: "تحصيل أسرع من العملاء (عرض)", unit: "days", targetValue: 50, assumption: "A-COLLECTION" },
    { code: "G-3", name: "تقليل تأخر المشاريع (عرض)", unit: "months", targetValue: 1, assumption: "A-DELAY" },
    { code: "G-4", name: "هامش ربح أعلى (عرض)", unit: "percent", targetValue: 13, assumption: "A-MARGIN" },
  ] as const;
  const goalIds: string[] = [];
  for (const goal of goals) {
    const created = await owner.createGoal({ tenantId, code: goal.code, name: goal.name, unit: goal.unit, targetValue: goal.targetValue, assumptionId: assumptionIds.get(goal.assumption) ?? null, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` });
    goalIds.push(created.id);
  }
  const initiatives = [
    ["I-1", "فريق دراسة مناقصات مخصص (عرض)", 0, "pmo", "in_progress"], ["I-2", "تسعير مبني على الافتراضات المعتمدة (عرض)", 0, "cost", "planned"],
    ["I-3", "متابعة المستخلصات أسبوعيًا (عرض)", 1, "cost", "in_progress"], ["I-4", "مورد بديل للبلوك (عرض)", 2, "pm", "done"],
    ["I-5", "تقرير يومي إلزامي لكل وردية (عرض)", 2, "plan", "in_progress"], ["I-6", "شراء مسبق للحديد (عرض)", 3, "cost", "planned"],
  ] as const;
  for (const [code, name, goal, owner_, status] of initiatives) {
    await owner.createInitiative({ tenantId, code, name, goalId: goalIds[goal], ownerUserId: input.peopleIds[owner_] ?? input.ownerUserId, dueAt: ymd(30 + goal * 30), status });
  }
  const counts = { assumptions: ASSUMPTIONS.length, approved: ASSUMPTIONS.filter(item => item[6] === "approve").length, competitors: COMPETITORS.length, swot: swot.length, opportunities: opportunities.length, goals: goals.length, initiatives: initiatives.length };
  input.log(`planning centre: ${JSON.stringify(counts)}`);
  return counts;
}
