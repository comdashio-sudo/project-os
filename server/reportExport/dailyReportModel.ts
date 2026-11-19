// D-47 (b): the daily report as one document model, sections 0–10 of the specification, that the Word and the PDF writers both draw. Every figure is the report's
// own (siteReports.get computes the totals, the variance and the day's inspections; nothing here is typed); the report number, the project and the date come from
// the system and go in the footer of every page. Logos and photos are read from storage; only PNG and JPEG are drawn (an SVG logo shows the party's name instead).
import { and, eq, inArray } from "drizzle-orm";
import { projectProfiles, projects, siteDailyReportPhotos, users } from "../../drizzle/schema";
import type { ExportLocale } from "../../shared/exportLocale";
import type { getSiteDailyReportForTenant } from "../siteReports";
import { storageRead } from "../storage";
import type { getDb } from "../db";

type Read = Awaited<ReturnType<typeof getSiteDailyReportForTenant>>;
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type Table = { columns: string[]; rows: string[][]; total?: string[] };
export type Section = { title: string; tables: Table[]; images?: Array<{ bytes: Buffer; caption: string }> };
export type DailyReportDocument = { rtl: boolean; title: string; header: Array<[string, string]>; logos: Array<{ party: string; bytes: Buffer | null }>; footer: string[]; sections: Section[]; pageWord: string; ofWord: string };

const AR = {
  title: "التقرير اليومي", project: "المشروع", number: "رقم التقرير", date: "التاريخ", day: "اليوم", weather: "الطقس", temperature: "الحرارة", wind: "الرياح", hours: "ساعات العمل",
  s: ["الرأس", "العمالة", "المعدات", "الإنجاز", "الفحوصات", "المواد المستلمة", "السلامة والصحة المهنية", "المعوقات", "خطة الغد", "الصور", "الاعتماد"],
  company: "الشركة", directDay: "مباشر نهار", directNight: "مباشر ليل", indirectDay: "غير مباشر نهار", indirectNight: "غير مباشر ليل", total: "الإجمالي",
  type: "النوع", model: "الطراز", plate: "اللوحة أو المقاس", count: "العدد", hoursCol: "الساعات", work: "العمل", planned: "المخطط", actual: "الفعلي", variance: "الانحراف",
  kind: "النوع", submitted: "مقدّم", approved: "معتمد", rejected: "مرفوض", pending: "معلّق", material: "المادة", quantity: "الكمية", unit: "الوحدة", supplier: "المورد",
  description: "الوصف", people: "العدد", action: "الإجراء", issue: "المشكلة", impact: "الأثر", responsible: "المسؤول", due: "التاريخ", area: "المنطقة", activity: "النشاط",
  resources: "الموارد", step: "الخطوة", by: "بواسطة", at: "الوقت", prepare: "أعدّه", review: "راجعه", approve: "اعتمده", page: "صفحة", of: "من",
  hse: { meeting: "اجتماع", incident: "حادث", near_miss: "شبه حادث", violation: "مخالفة", corrective_action: "إجراء تصحيحي" } as Record<string, string>,
  days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"], parties: ["العميل", "الاستشاري", "المقاول"],
};
const EN: typeof AR = {
  title: "Daily report", project: "Project", number: "Report no.", date: "Date", day: "Day", weather: "Weather", temperature: "Temperature", wind: "Wind", hours: "Working hours",
  s: ["Header", "Labour", "Equipment", "Progress", "Inspections", "Materials received", "HSE", "Obstacles", "Plan for tomorrow", "Photos", "Approval"],
  company: "Company", directDay: "Direct day", directNight: "Direct night", indirectDay: "Indirect day", indirectNight: "Indirect night", total: "Total",
  type: "Type", model: "Model", plate: "Plate or size", count: "Count", hoursCol: "Hours", work: "Work", planned: "Planned", actual: "Actual", variance: "Variance",
  kind: "Kind", submitted: "Submitted", approved: "Approved", rejected: "Rejected", pending: "Pending", material: "Material", quantity: "Quantity", unit: "Unit", supplier: "Supplier",
  description: "Description", people: "People", action: "Action", issue: "Issue", impact: "Impact", responsible: "Responsible", due: "Date", area: "Area", activity: "Activity",
  resources: "Resources", step: "Step", by: "By", at: "At", prepare: "Prepared", review: "Reviewed", approve: "Approved", page: "Page", of: "of",
  hse: { meeting: "Meeting", incident: "Incident", near_miss: "Near miss", violation: "Violation", corrective_action: "Corrective action" },
  days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], parties: ["Client", "Consultant", "Contractor"],
};
const n = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(Math.round(value * 1000) / 1000));
const stamp = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "");
const image = async (key: string | null | undefined): Promise<Buffer | null> => {
  if (!key) return null;
  const bytes = Buffer.from(await storageRead(key).catch(() => new Uint8Array()));
  return (bytes[0] === 0x89 && bytes[1] === 0x50) || (bytes[0] === 0xff && bytes[1] === 0xd8) ? bytes : null;
};

export async function buildDailyReportDocument(db: Db, scope: { tenantId: string; projectId: string }, read: Read, locale: ExportLocale): Promise<DailyReportDocument> {
  const w = locale === "ar" ? AR : EN;
  const mine = <T extends { tenantId: never; projectId: never }>(table: T) => and(eq(table.tenantId, scope.tenantId as never), eq(table.projectId, scope.projectId as never));
  const [[project], [profile], photos] = await Promise.all([
    db.select({ name: projects.name }).from(projects).where(and(eq(projects.id, scope.projectId), eq(projects.tenantId, scope.tenantId))).limit(1),
    db.select().from(projectProfiles).where(mine(projectProfiles as never)).limit(1),
    db.select({ key: siteDailyReportPhotos.storageKey, caption: siteDailyReportPhotos.caption, zone: siteDailyReportPhotos.zone }).from(siteDailyReportPhotos).where(and(mine(siteDailyReportPhotos as never), eq(siteDailyReportPhotos.reportId, read.report.id))),
  ]);
  const { report, totals, approval } = read;
  const ids = [approval.prepare.by, approval.review.by, approval.approve.by].filter((id): id is number => typeof id === "number");
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map(row => [row.id, row.name ?? ""]));
  const projectName = project?.name ?? "";
  const companies = totals.labour.byCompany.map(item => item.companyId);
  const labourOf = (companyId: string, category: string, shift: string) => read.labour.filter(row => row.companyId === companyId && row.category === category && row.shift === shift).reduce((sum, row) => sum + row.headcount, 0);
  const labourRows = companies.map(id => { const v = [labourOf(id, "direct", "day"), labourOf(id, "direct", "night"), labourOf(id, "indirect", "day"), labourOf(id, "indirect", "night")]; return [read.labour.find(row => row.companyId === id)!.companyName, ...v.map(n), n(v.reduce((a, b) => a + b, 0))]; });
  const sections: Section[] = [
    { title: `0 - ${w.s[0]}`, tables: [{ columns: [w.weather, w.temperature, w.wind, w.hours], rows: [[report.weather ?? "", n(report.temperatureC === null ? null : Number(report.temperatureC)), report.wind ?? "", n(report.workHours)]] }] },
    { title: `1 - ${w.s[1]}`, tables: [{ columns: [w.company, w.directDay, w.directNight, w.indirectDay, w.indirectNight, w.total], rows: labourRows, total: [w.total, ...[1, 2, 3, 4].map(c => n(labourRows.reduce((sum, row) => sum + Number(row[c]), 0))), n(totals.labour.total)] }] },
    { title: `2 - ${w.s[2]}`, tables: [{ columns: [w.type, w.model, w.plate, w.count, w.hoursCol], rows: read.equipment.map(row => [row.equipmentType, row.model ?? "", row.plateOrSize ?? "", n(row.count), n(row.hours)]), total: [w.total, "", "", n(totals.equipment.count), n(totals.equipment.hours)] }] },
    { title: `3 - ${w.s[3]}`, tables: [{ columns: [w.work, w.planned, w.actual, w.variance], rows: read.lines.filter(line => line.lineType === "work").map(line => [line.description ?? "", n(line.plannedQuantity), n(line.actualQuantity), n(line.variance)]) }] },
    { title: `4 - ${w.s[4]}`, tables: [{ columns: [w.kind, w.submitted, w.approved, w.rejected, w.pending], rows: (["wir", "rfi"] as const).map(kind => [kind.toUpperCase(), n(read.inspections[kind].submitted), n(read.inspections[kind].approved), n(read.inspections[kind].rejected), n(read.inspections[kind].pending)]) }] },
    { title: `5 - ${w.s[5]}`, tables: [{ columns: [w.material, w.quantity, w.unit, w.supplier], rows: read.materials.map(row => [row.material, n(row.quantity), row.unit, row.supplier ?? ""]) }] },
    { title: `6 - ${w.s[6]}`, tables: [{ columns: [w.kind, w.description, w.people, w.action], rows: read.hse.map(row => [w.hse[row.kind] ?? row.kind, row.description, n(row.peopleCount), row.actionTaken ?? ""]) }] },
    { title: `7 - ${w.s[7]}`, tables: [{ columns: [w.issue, w.impact, w.responsible, w.action, w.due], rows: read.obstacleItems.map(row => [row.issue, row.impact ?? "", row.responsible ?? "", row.action ?? "", row.dueDate ?? ""]) }] },
    { title: `8 - ${w.s[8]}`, tables: [{ columns: [w.area, w.activity, w.quantity, w.unit, w.resources], rows: read.tomorrow.map(row => [row.area ?? "", row.activity, n(row.quantity), row.unit ?? "", row.resources ?? ""]) }] },
    { title: `9 - ${w.s[9]}`, tables: [], images: (await Promise.all(photos.map(async photo => ({ bytes: await image(photo.key), caption: [photo.caption, photo.zone].filter(Boolean).join(" — ") })))).flatMap(item => (item.bytes ? [{ bytes: item.bytes, caption: item.caption }] : [])) },
    { title: `10 - ${w.s[10]}`, tables: [{ columns: [w.step, w.by, w.at], rows: (["prepare", "review", "approve"] as const).map(step => [w[step], names.get(approval[step].by as number) ?? "", stamp(approval[step].at)]) }] },
  ];
  return {
    rtl: locale === "ar", title: w.title, pageWord: w.page, ofWord: w.of,
    header: [[w.project, projectName], [w.number, report.reportNumber ?? ""], [w.date, report.reportDate], [w.day, w.days[new Date(`${report.reportDate}T00:00:00Z`).getUTCDay()]]],
    logos: await Promise.all((["clientLogoKey", "consultantLogoKey", "contractorLogoKey"] as const).map(async (column, i) => ({ party: [profile?.clientName, profile?.consultantName, profile?.contractorName][i] || w.parties[i], bytes: await image(profile?.[column]) }))),
    footer: [report.reportNumber ?? "", projectName, report.reportDate], sections,
  };
}
