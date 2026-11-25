// Q-25 (P-113/P-114), batch 2: the minutes of one project meeting as the same document model the daily report's Word and PDF writers draw
// (server/reportExport/dailyReportDocx.ts, dailyReportPdf.ts). Every line is the meeting's own, read through getProjectMeeting (its read gate): who attended,
// the minutes item by item, the actions the meeting raised and the open actions brought forward from earlier meetings. Nothing is typed here. The three
// parties' logos head it as in the daily report; «meeting | project | date | page x of y» closes every page. A draft says so in its header.
import { and, eq } from "drizzle-orm";
import { projectProfiles, projects } from "../../drizzle/schema";
import type { ExportLocale } from "../../shared/exportLocale";
import type { getDb } from "../db";
import type { getProjectMeeting } from "../meetings";
import { storageRead } from "../storage";
import type { DailyReportDocument, Section } from "./dailyReportModel";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Read = Awaited<ReturnType<typeof getProjectMeeting>>;

const AR = {
  title: "محضر اجتماع", project: "المشروع", meeting: "الاجتماع", type: "النوع", heldAt: "التاريخ والوقت", location: "المكان", status: "الحالة", draft: "مسودة — غير صادر", issued: "صادر",
  attended: "الحضور", name: "الاسم", organisation: "الجهة", present: "حاضر", yes: "نعم", no: "لا", items: "بنود المحضر", topic: "الموضوع", discussion: "النقاش", decision: "القرار",
  actions: "المهام التي أقرّها الاجتماع", forward: "مهام مفتوحة مرحّلة من اجتماعات سابقة", action: "المهمة", owner: "المالك", due: "الموعد", priority: "الأولوية", actionStatus: "الحالة",
  page: "صفحة", of: "من", parties: ["العميل", "الاستشاري", "المقاول"],
  types: { progress: "متابعة التقدم", coordination: "تنسيق", safety: "سلامة", client: "مع المالك", design: "تصميم", other: "آخر" } as Record<string, string>,
  priorities: { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" } as Record<string, string>,
  statuses: { open: "مفتوحة", in_progress: "جارية", completed: "منجزة", cancelled: "ملغاة" } as Record<string, string>,
};
const EN: typeof AR = {
  title: "Minutes of meeting", project: "Project", meeting: "Meeting", type: "Type", heldAt: "Date and time", location: "Place", status: "Status", draft: "Draft — not issued", issued: "Issued",
  attended: "Attendees", name: "Name", organisation: "Organisation", present: "Present", yes: "Yes", no: "No", items: "Minutes", topic: "Topic", discussion: "Discussion", decision: "Decision",
  actions: "Actions raised by the meeting", forward: "Open actions brought forward from earlier meetings", action: "Action", owner: "Owner", due: "Due", priority: "Priority", actionStatus: "Status",
  page: "Page", of: "of", parties: ["Client", "Consultant", "Contractor"],
  types: { progress: "Progress", coordination: "Coordination", safety: "Safety", client: "With the client", design: "Design", other: "Other" },
  priorities: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
  statuses: { open: "Open", in_progress: "In progress", completed: "Done", cancelled: "Cancelled" },
};
// Urdu takes the English words, as the daily report's export does (server/reportExport/dailyReportModel.ts)
const words = (locale: ExportLocale) => (locale === "ar" ? AR : EN);
const stamp = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "");
const day = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : "");
const image = async (key: string | null | undefined): Promise<Buffer | null> => {
  if (!key) return null;
  const bytes = Buffer.from(await storageRead(key).catch(() => new Uint8Array()));
  return (bytes[0] === 0x89 && bytes[1] === 0x50) || (bytes[0] === 0xff && bytes[1] === 0xd8) ? bytes : null;
};

/** The minutes as a document: pure apart from reading the project's name and its parties' logos (both of this company and project only). */
export async function buildMeetingMinutesDocument(db: Db, scope: { tenantId: string; projectId: string }, read: Read, locale: ExportLocale): Promise<DailyReportDocument> {
  const w = words(locale);
  const [[project], [profile]] = await Promise.all([
    db.select({ name: projects.name }).from(projects).where(and(eq(projects.id, scope.projectId), eq(projects.tenantId, scope.tenantId))).limit(1),
    db.select().from(projectProfiles).where(and(eq(projectProfiles.tenantId, scope.tenantId), eq(projectProfiles.projectId, scope.projectId))).limit(1),
  ]);
  const projectName = project?.name ?? "";
  const { meeting, attendees, items, actions, broughtForward } = read;
  const actionRows = (rows: Read["actions"]) => rows.map(row => [row.title, row.ownerName ?? "", day(row.dueAt), w.priorities[row.priority] ?? row.priority, w.statuses[row.status] ?? row.status]);
  const actionColumns = [w.action, w.owner, w.due, w.priority, w.actionStatus];
  const sections: Section[] = [
    { title: `1 - ${w.attended}`, tables: [{ columns: [w.name, w.organisation, w.present], rows: attendees.map(person => [person.name, person.organisation ?? "", person.present ? w.yes : w.no]) }] },
    { title: `2 - ${w.items}`, tables: [{ columns: ["#", w.topic, w.discussion, w.decision], rows: items.map(row => [String(row.itemNumber), row.topic, row.discussion ?? "", row.decision ?? ""]) }] },
    { title: `3 - ${w.actions}`, tables: [{ columns: actionColumns, rows: actionRows(actions) }] },
    { title: `4 - ${w.forward}`, tables: [{ columns: actionColumns, rows: actionRows(broughtForward) }] },
  ];
  return {
    rtl: locale === "ar", title: w.title, pageWord: w.page, ofWord: w.of,
    header: [[w.project, projectName], [w.meeting, meeting.title], [w.type, w.types[meeting.meetingType] ?? meeting.meetingType], [w.heldAt, stamp(meeting.heldAt)], [w.location, meeting.location ?? ""], [w.status, meeting.status === "issued" ? w.issued : w.draft]],
    logos: await Promise.all((["clientLogoKey", "consultantLogoKey", "contractorLogoKey"] as const).map(async (column, i) => ({ party: [profile?.clientName, profile?.consultantName, profile?.contractorName][i] || w.parties[i], bytes: await image(profile?.[column]) }))),
    footer: [meeting.title, projectName, day(meeting.heldAt)], sections,
  };
}
