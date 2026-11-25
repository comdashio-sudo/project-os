import type { ExportColumn, ExportSheet } from "./excelExport";
import type { Language } from "./language";

// Q-57 (4): the daily reports of a period as one Excel workbook — a sheet each for the reports, the labour, the equipment, the works, the obstacles, the
// inspections and the safety entries. Pure: it takes the reports as the server returned them (siteReports.get, already stripped of every section the reader
// may not see, so a reader without the safety section gets an empty safety sheet, never someone else's rows) and lays them out. Nothing here reads more.

type Num = number | null;
export type RangeReport = {
  report: { id: string; reportNumber: string | null; reportDate: string; status: string; weather: string | null; temperatureC: string | null; wind: string | null; workHours: Num; summary: string | null; obstacles: string | null; reviewNote: string | null };
  labour: Array<{ companyName: string; roleName: string; category: string; shift: string; headcount: number }>;
  equipment: Array<{ equipmentType: string; model: string | null; plateOrSize: string | null; count: number; hours: Num }>;
  lines: Array<{ lineType: string; wbsCode: string | null; label: string | null; description: string | null; quantity: Num; hours: Num; plannedQuantity: Num; actualQuantity: Num; variance: Num; reportedStatus: string | null }>;
  obstacleItems: Array<{ issue: string; impact: string | null; responsible: string | null; action: string | null; dueDate: string | null }>;
  inspections: { wir: { items: Array<{ code: string; state: string }> }; rfi: { items: Array<{ number: string; state: string }> } };
  hse: Array<{ kind: string; description: string; peopleCount: Num; actionTaken: string | null }>;
  totals: { labour: { total: number; direct: number; indirect: number; day: number; night: number }; equipment: { count: number; hours: number } };
};

type Words = Record<string, string>;
const DICTIONARY: Record<Language, { sheets: Words; columns: Words; status: Words; shift: Words; category: Words; state: Words; hse: Words; scopeTitle: string }> = {
  ar: {
    scopeTitle: "سجل التقارير اليومية",
    sheets: { reports: "التقارير", labour: "العمالة", equipment: "المعدات", works: "الأعمال", obstacles: "المعوقات", inspections: "الفحوصات", safety: "السلامة" },
    columns: { date: "التاريخ", number: "رقم التقرير", status: "الحالة", weather: "الطقس", temperature: "الحرارة °C", wind: "الرياح", hours: "ساعات العمل", labourTotal: "إجمالي العمالة", direct: "مباشرة", indirect: "غير مباشرة", day: "نهاري", night: "ليلي", equipmentCount: "عدد المعدات", summary: "الملخص", obstacles: "المعوقات", note: "ملاحظة المراجعة",
      company: "الشركة", role: "المهنة", category: "الفئة", shift: "الوردية", headcount: "العدد", type: "النوع", model: "الموديل", plate: "اللوحة / الحجم", count: "العدد", equipHours: "الساعات", wbs: "رمز WBS", label: "البند", description: "الوصف", planned: "المخطط", actual: "المنفذ", variance: "الفرق", reached: "الحالة المبلّغ بها",
      issue: "المعوق", impact: "الأثر", responsible: "المسؤول", action: "الإجراء", due: "تاريخ الاستحقاق", kind: "النوع", code: "الرمز", people: "عدد الأشخاص" },
    status: { draft: "مسودة", submitted: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض" },
    shift: { day: "نهاري", night: "ليلي" }, category: { direct: "مباشرة", indirect: "غير مباشرة" },
    state: { approved: "معتمد", rejected: "مرفوض", pending: "قيد المراجعة" },
    hse: { meeting: "اجتماع توعية", incident: "حادث", near_miss: "حادث وشيك", violation: "مخالفة", corrective_action: "إجراء تصحيحي" },
  },
  en: {
    scopeTitle: "Daily reports log",
    sheets: { reports: "Reports", labour: "Labour", equipment: "Equipment", works: "Works", obstacles: "Obstacles", inspections: "Inspections", safety: "Safety" },
    columns: { date: "Date", number: "Report no.", status: "Status", weather: "Weather", temperature: "Temp °C", wind: "Wind", hours: "Working hours", labourTotal: "Total labour", direct: "Direct", indirect: "Indirect", day: "Day", night: "Night", equipmentCount: "Machines", summary: "Summary", obstacles: "Obstacles", note: "Review note",
      company: "Company", role: "Trade", category: "Category", shift: "Shift", headcount: "Headcount", type: "Type", model: "Model", plate: "Plate / size", count: "Count", equipHours: "Hours", wbs: "WBS code", label: "Item", description: "Description", planned: "Planned", actual: "Done", variance: "Variance", reached: "Reported status",
      issue: "Obstacle", impact: "Impact", responsible: "Responsible", action: "Action", due: "Due date", kind: "Kind", code: "Code", people: "People" },
    status: { draft: "Draft", submitted: "Awaiting approval", approved: "Approved", rejected: "Sent back" },
    shift: { day: "Day", night: "Night" }, category: { direct: "Direct", indirect: "Indirect" },
    state: { approved: "Approved", rejected: "Rejected", pending: "Pending" },
    hse: { meeting: "Toolbox meeting", incident: "Incident", near_miss: "Near miss", violation: "Violation", corrective_action: "Corrective action" },
  },
  ur: {
    scopeTitle: "روزانہ رپورٹوں کا ریکارڈ",
    sheets: { reports: "رپورٹیں", labour: "مزدور", equipment: "سازوسامان", works: "کام", obstacles: "رکاوٹیں", inspections: "معائنے", safety: "حفاظت" },
    columns: { date: "تاریخ", number: "رپورٹ نمبر", status: "حالت", weather: "موسم", temperature: "درجہ حرارت °C", wind: "ہوا", hours: "کام کے گھنٹے", labourTotal: "کل مزدور", direct: "براہِ راست", indirect: "بالواسطہ", day: "دن", night: "رات", equipmentCount: "مشینیں", summary: "خلاصہ", obstacles: "رکاوٹیں", note: "جائزے کا نوٹ",
      company: "کمپنی", role: "پیشہ", category: "زمرہ", shift: "شفٹ", headcount: "تعداد", type: "قسم", model: "ماڈل", plate: "پلیٹ / سائز", count: "تعداد", equipHours: "گھنٹے", wbs: "WBS کوڈ", label: "آئٹم", description: "تفصیل", planned: "منصوبہ", actual: "مکمل", variance: "فرق", reached: "رپورٹ شدہ حالت",
      issue: "رکاوٹ", impact: "اثر", responsible: "ذمہ دار", action: "اقدام", due: "مقررہ تاریخ", kind: "قسم", code: "کوڈ", people: "افراد" },
    status: { draft: "مسودہ", submitted: "منظوری کا منتظر", approved: "منظور شدہ", rejected: "واپس کیا گیا" },
    shift: { day: "دن", night: "رات" }, category: { direct: "براہِ راست", indirect: "بالواسطہ" },
    state: { approved: "منظور شدہ", rejected: "مسترد", pending: "زیرِ جائزہ" },
    hse: { meeting: "حفاظتی میٹنگ", incident: "حادثہ", near_miss: "بال بال بچاؤ", violation: "خلاف ورزی", corrective_action: "اصلاحی اقدام" },
  },
};

const dayOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const numeric = (value: string | null) => (value === null || value === "" ? null : Number(value));

export type RangeSheetKey = "reports" | "labour" | "equipment" | "works" | "obstacles" | "inspections" | "safety";

/** The seven sheets, reports in date order. A sheet with no rows is still returned (its header), so the file shows the period had none. */
export function buildDailyRangeSheets(reports: readonly RangeReport[], locale: Language): { title: string; sheets: Array<ExportSheet<any> & { key: RangeSheetKey }> } {
  const w = DICTIONARY[locale];
  const ordered = [...reports].sort((a, b) => a.report.reportDate.localeCompare(b.report.reportDate) || (a.report.reportNumber ?? "").localeCompare(b.report.reportNumber ?? ""));
  const head = (read: RangeReport) => ({ date: dayOf(read.report.reportDate), number: read.report.reportNumber ?? "" });
  type Row<T> = { read: RangeReport; item: T };
  const flat = <T,>(pick: (read: RangeReport) => T[]): Row<T>[] => ordered.flatMap(read => pick(read).map(item => ({ read, item })));
  const common = <T,>(): ExportColumn<Row<T>>[] => [{ header: w.columns.date, kind: "date", value: row => head(row.read).date }, { header: w.columns.number, value: row => head(row.read).number }];
  const sheet = <T,>(key: RangeSheetKey, rows: Row<T>[], columns: ExportColumn<Row<T>>[]) => ({ key, sheetName: w.sheets[key], title: `${w.scopeTitle} · ${w.sheets[key]}`, rows, columns: [...common<T>(), ...columns] });

  const reportRows = ordered.map(read => ({ read, item: read }));
  return {
    title: w.scopeTitle,
    sheets: [
      sheet("reports", reportRows, [
        { header: w.columns.status, value: r => w.status[r.item.report.status] ?? r.item.report.status },
        { header: w.columns.weather, value: r => r.item.report.weather ?? "" },
        { header: w.columns.temperature, value: r => numeric(r.item.report.temperatureC) },
        { header: w.columns.wind, value: r => r.item.report.wind ?? "" },
        { header: w.columns.hours, value: r => r.item.report.workHours },
        { header: w.columns.labourTotal, value: r => r.item.totals.labour.total },
        { header: w.columns.direct, value: r => r.item.totals.labour.direct },
        { header: w.columns.indirect, value: r => r.item.totals.labour.indirect },
        { header: w.columns.day, value: r => r.item.totals.labour.day },
        { header: w.columns.night, value: r => r.item.totals.labour.night },
        { header: w.columns.equipmentCount, value: r => r.item.totals.equipment.count },
        { header: w.columns.summary, value: r => r.item.report.summary ?? "" },
        { header: w.columns.obstacles, value: r => r.item.report.obstacles ?? "" },
        { header: w.columns.note, value: r => r.item.report.reviewNote ?? "" },
      ]),
      sheet("labour", flat(read => read.labour), [
        { header: w.columns.company, value: r => r.item.companyName }, { header: w.columns.role, value: r => r.item.roleName },
        { header: w.columns.category, value: r => w.category[r.item.category] ?? r.item.category }, { header: w.columns.shift, value: r => w.shift[r.item.shift] ?? r.item.shift },
        { header: w.columns.headcount, kind: "number", value: r => r.item.headcount },
      ]),
      sheet("equipment", flat(read => read.equipment), [
        { header: w.columns.type, value: r => r.item.equipmentType }, { header: w.columns.model, value: r => r.item.model ?? "" }, { header: w.columns.plate, value: r => r.item.plateOrSize ?? "" },
        { header: w.columns.count, kind: "number", value: r => r.item.count }, { header: w.columns.equipHours, kind: "number", value: r => r.item.hours },
      ]),
      sheet("works", flat(read => read.lines.filter(line => line.lineType === "work")), [
        { header: w.columns.wbs, value: r => r.item.wbsCode ?? "" }, { header: w.columns.label, value: r => r.item.label ?? "" }, { header: w.columns.description, value: r => r.item.description ?? "" },
        { header: w.columns.planned, kind: "number", value: r => r.item.plannedQuantity }, { header: w.columns.actual, kind: "number", value: r => r.item.actualQuantity }, { header: w.columns.variance, kind: "number", value: r => r.item.variance },
        { header: w.columns.reached, value: r => r.item.reportedStatus ?? "" },
      ]),
      sheet("obstacles", flat(read => read.obstacleItems), [
        { header: w.columns.issue, value: r => r.item.issue }, { header: w.columns.impact, value: r => r.item.impact ?? "" }, { header: w.columns.responsible, value: r => r.item.responsible ?? "" },
        { header: w.columns.action, value: r => r.item.action ?? "" }, { header: w.columns.due, kind: "date", value: r => (r.item.dueDate ? dayOf(r.item.dueDate) : null) },
      ]),
      sheet("inspections", flat(read => [
        ...read.inspections.wir.items.map(item => ({ kind: "WIR", code: item.code, state: item.state })),
        ...read.inspections.rfi.items.map(item => ({ kind: "RFI", code: item.number, state: item.state })),
      ]), [
        { header: w.columns.kind, value: r => r.item.kind }, { header: w.columns.code, value: r => r.item.code }, { header: w.columns.status, value: r => w.state[r.item.state] ?? r.item.state },
      ]),
      sheet("safety", flat(read => read.hse), [
        { header: w.columns.kind, value: r => w.hse[r.item.kind] ?? r.item.kind }, { header: w.columns.description, value: r => r.item.description },
        { header: w.columns.people, kind: "number", value: r => r.item.peopleCount }, { header: w.columns.action, value: r => r.item.actionTaken ?? "" },
      ]),
    ],
  };
}
