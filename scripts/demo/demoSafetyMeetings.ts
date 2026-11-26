// Q-55 batch 3 (a): the demonstration company's safety register and project meetings, written through the platform's own procedures (the same checks, numbering
// and audit rows as the screens) by the made-up people who hold the right: the safety engineer records incidents and permits to work, the project manager
// holds the meetings, writes their minutes item by item and gives out their actions. Everything is obviously made up: titles end in «(عرض)», no real place or
// person. Called from seedDemoCompany once the people's memberships are active; the erasure removes it with the company.
import type { PoolClient } from "pg";

type Caller = {
  safety: {
    recordIncident(input: Record<string, unknown>): Promise<{ id: string }>;
    updateIncident(input: Record<string, unknown>): Promise<unknown>;
    issuePermit(input: Record<string, unknown>): Promise<{ id: string }>;
    closePermit(input: Record<string, unknown>): Promise<unknown>;
  };
  meetings: {
    create(input: Record<string, unknown>): Promise<{ id: string }>;
    addItem(input: Record<string, unknown>): Promise<unknown>;
    addAction(input: Record<string, unknown>): Promise<unknown>;
    issue(input: Record<string, unknown>): Promise<unknown>;
  };
};

const INCIDENTS = [
  { number: "INC-001", ago: 70, kind: "near_miss", title: "سقوط أداة من سقالة دون إصابة (عرض)", description: "سقط مفتاح ربط من الطابق الأول في منطقة محاطة بحاجز؛ لا إصابة.", location: "المنطقة الشمالية — المجموعة 3", people: 0, close: { rootCause: "أداة بلا حبل تثبيت", correctiveAction: "حبال تثبيت للأدوات على كل سقالة" } },
  { number: "INC-002", ago: 48, kind: "first_aid", title: "جرح سطحي في اليد أثناء قص الحديد (عرض)", description: "جرح سطحي عولج في عيادة الموقع وعاد العامل لعمله.", location: "ورشة الحديد", people: 1, close: { rootCause: "قفازات غير مناسبة للقص", correctiveAction: "قفازات مقاومة للقطع في ورشة الحديد" } },
  { number: "INC-003", ago: 30, kind: "lost_time", title: "التواء كاحل على أرضية غير مستوية (عرض)", description: "التواء كاحل عند النزول من منصة مؤقتة؛ غياب يومي عمل.", location: "المنطقة الجنوبية — المجموعة 12", people: 1, lostDays: 2 },
  { number: "INC-004", ago: 9, kind: "near_miss", title: "اقتراب رافعة من خط كهرباء مؤقت (عرض)", description: "أوقف المراقب الرفع قبل ملامسة الخط؛ أُعيد تخطيط مسار الرافعة.", location: "مدخل الموقع", people: 0 },
] as const;

const PERMITS = [
  { number: "PTW-101", type: "hot_work", description: "لحام حديد السقف (عرض)", location: "المجموعة 5", from: 6, to: 4, close: "closed" as const },
  { number: "PTW-102", type: "work_at_height", description: "تركيب الواجهات من سقالة متحركة (عرض)", location: "المجموعة 8", from: 4, to: 1, close: "closed" as const },
  { number: "PTW-103", type: "excavation", description: "حفر خندق تمديدات المياه (عرض)", location: "الشارع الداخلي 2", from: 2, to: -3 },
  { number: "PTW-104", type: "electrical", description: "توصيل اللوحة المؤقتة للمجموعة 14 (عرض)", location: "المجموعة 14", from: 1, to: -1 },
  { number: "PTW-105", type: "lifting", description: "رفع خزانات المياه العلوية (عرض)", location: "المجموعة 9", from: 0, to: -2 },
] as const;

const MEETINGS = [
  { type: "progress", ago: 14, title: "اجتماع التقدم الأسبوعي رقم 11 (عرض)", location: "مكتب الموقع", issue: true,
    items: [["تقدم الأعمال الإنشائية", "الإنجاز 16% مقابل 18% مخطط؛ التأخر في المنطقة الجنوبية.", "زيادة وردية في المنطقة الجنوبية لأسبوعين."], ["توريد البلوك", "المورد الحالي متأخر 4 أيام.", "اعتماد مورد بديل للمجموعات 12–16."], ["السلامة", "حادث وشيك واحد هذا الأسبوع.", "جولة سلامة يومية مع المقاول الباطن."]],
    actions: [["تفعيل الوردية الإضافية في المنطقة الجنوبية", "pm", 7, "high"], ["إرسال أمر شراء للمورد البديل", "cost", 3, "medium"]] },
  { type: "coordination", ago: 10, title: "تنسيق المخططات الكهربائية والإنشائية (عرض)", location: "قاعة الاجتماعات", issue: true,
    items: [["تعارض مسارات الكهرباء مع الكمرات", "ثلاث حالات تعارض في النموذج B.", "تعديل المسار حسب اقتراح الاستشاري."], ["جدول تسليم مخططات الورشة", "مخططات الواجهات متأخرة.", "التسليم خلال أسبوع."]],
    actions: [["تحديث مخطط الكهرباء للنموذج B", "plan", 5, "high"], ["متابعة مخططات ورشة الواجهات", "coord", 7, "medium"]] },
  { type: "safety", ago: 3, title: "اجتماع السلامة الشهري (عرض)", location: "مكتب الموقع", issue: false,
    items: [["مراجعة حوادث الشهر", "حادث مضيّع للوقت واحد وحادثان وشيكان.", "حملة توعية للعمل على الارتفاعات."], ["تصاريح العمل", "ثلاثة تصاريح مفتوحة.", "إغلاق التصاريح المنتهية في نهاية كل وردية."]],
    actions: [["حملة توعية للعمل على الارتفاعات", "hse", 10, "medium"]] },
] as const;

export async function seedSafetyAndMeetings(input: {
  client: PoolClient; tenantId: string; projectId: string; /** the project whose safety register is kept (its approved dailies give the man-hours) */ safetyProjectId: string; now: Date;
  callerOf: (key: "hse" | "pm") => Caller; membershipOf: (key: string) => string | undefined; nameOf: (key: string) => string; log: (message: string) => void;
}) {
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const daysAgo = (n: number) => new Date(input.now.getTime() - n * 86_400_000);
  const ymd = (n: number) => new Date(daysAgo(n).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

  // 1. the safety register: four incidents (two closed with their cause and action) and five permits to work (two closed, three open)
  const hse = input.callerOf("hse");
  const safetyScope = { tenantId: input.tenantId, projectId: input.safetyProjectId };
  for (const incident of INCIDENTS) {
    const recorded = await hse.safety.recordIncident({ ...safetyScope, incidentNumber: incident.number, occurredOn: ymd(incident.ago), kind: incident.kind, title: incident.title, description: incident.description,
      location: incident.location, peopleInvolved: incident.people, ...("lostDays" in incident ? { lostDays: incident.lostDays } : {}) });
    if ("close" in incident) await hse.safety.updateIncident({ ...safetyScope, incidentId: recorded.id, status: "closed", ...incident.close });
  }
  for (const permit of PERMITS) {
    const issued = await hse.safety.issuePermit({ ...safetyScope, permitNumber: permit.number, permitType: permit.type, description: permit.description, location: permit.location,
      responsibleParty: "المقاول الرئيسي (عرض)", validFrom: daysAgo(permit.from), validTo: daysAgo(permit.to) });
    if ("close" in permit) await hse.safety.closePermit({ ...safetyScope, permitId: issued.id, outcome: permit.close, note: "انتهى العمل وفُحص المكان (عرض)" });
  }

  // 2. three meetings with their minutes and actions; the first two issued (their minutes final), the last still a draft
  const pm = input.callerOf("pm");
  let actions = 0;
  for (const meeting of MEETINGS) {
    const attendees = (["pm", "plan", "site1", "qc", "hse"] as const).map(key => ({ membershipId: input.membershipOf(key), name: input.nameOf(key), present: true }))
      .concat([{ membershipId: undefined, name: "ممثل الاستشاري (عرض)", present: true }]).map(({ membershipId, ...rest }) => (membershipId ? { membershipId, ...rest } : rest));
    const created = await pm.meetings.create({ ...scope, meetingType: meeting.type, title: meeting.title, heldAt: daysAgo(meeting.ago), location: meeting.location, attendees });
    for (const [topic, discussion, decision] of meeting.items) await pm.meetings.addItem({ ...scope, meetingId: created.id, topic, discussion, decision });
    for (const [title, owner, dueIn, priority] of meeting.actions) {
      const ownerMembershipId = input.membershipOf(owner);
      if (!ownerMembershipId) continue;
      await pm.meetings.addAction({ ...scope, meetingId: created.id, title: `${title} (عرض)`, ownerMembershipId, dueAt: daysAgo(meeting.ago - dueIn), priority });
      actions += 1;
    }
    if (meeting.issue) await pm.meetings.issue({ ...scope, meetingId: created.id });
  }
  input.log(`safety: ${INCIDENTS.length} incidents, ${PERMITS.length} permits; meetings: ${MEETINGS.length} with ${actions} actions`);
  return { incidents: INCIDENTS.length, permits: PERMITS.length, meetings: MEETINGS.length, actions };
}
