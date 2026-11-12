// Q-9 (c) / D-47 (b): the daily report as a document — sections 0 to 10 of the specification, from what the server returns for the report (siteReports.get) and
// nothing typed. The same element is the PDF (the browser draws it, so Arabic shaping and right-to-left order are the browser's own; see lib/pdfExport.ts) and the
// Word file (an HTML document Word opens as .doc). Inline styles only: neither a canvas snapshot nor Word reads the app's stylesheet classes reliably.
import React from "react";
import { formatNumber } from "@/components/ds/format";

type Lang = "ar" | "en" | "ur";
type Row = Record<string, unknown>;
export type ReportForDocument = {
  report: { reportNumber?: string | null; reportDate: string; weather?: string | null; temperatureC?: number | string | null; wind?: string | null; workHours?: number | null; summary?: string | null; obstacles?: string | null; status: string };
  labour?: Array<{ companyName: string; roleName: string; shift: string; headcount: number }>;
  equipment?: Array<{ equipmentType: string; model: string | null; plateOrSize: string | null; count: number; hours: number | null }>;
  lines?: Array<{ lineType: string; label: string | null; quantity: number | null; hours: number | null; description: string | null; pmcUnitId: string | null; pmcActivityDefinitionId: string | null; reportedStatus: string | null }>;
  inspections?: { wir: { submitted: number; approved: number; rejected: number; pending: number }; rfi: { submitted: number; approved: number; rejected: number; pending: number } };
  materials?: Row[]; hse?: Row[]; obstacleItems?: Row[]; tomorrow?: Row[];
  photos?: Array<{ id: string; fileName: string; caption?: string | null; zone?: string | null }>;
  approval?: Record<"prepare" | "review" | "approve", { at: Date | string | null }>;
  totals?: { labour: { total: number; day: number; night: number }; equipment: { count: number; hours: number }; cumulativeManDays: number };
};

const AR = { title: "التقرير اليومي", no: "رقم", date: "التاريخ", weather: "الطقس", temp: "الحرارة (°م)", wind: "الرياح", hours: "ساعات العمل", s: ["0) الرأس", "1) العمالة", "2) المعدات", "3) الأعمال المنفذة", "4) الفحوصات", "5) المواد المستلمة", "6) السلامة", "7) المعوقات", "8) خطة الغد", "9) الصور", "10) الاعتماد"],
    company: "الشركة", trade: "المهنة", day: "نهار", night: "ليل", total: "المجموع", cumulative: "أيام العمل التراكمية", machine: "المعدة", count: "العدد", unit: "الوحدة", activity: "النشاط", status: "الحالة", notes: "ملاحظات",
    submitted: "مقدّم", approved: "معتمد", rejected: "مرفوض", pending: "معلّق", material: "المادة", qty: "الكمية", supplier: "المورد", kind: "النوع", desc: "الوصف", people: "الأشخاص", action: "الإجراء", issue: "المعوق", impact: "الأثر", responsible: "المسؤول", due: "الموعد", area: "المنطقة", resources: "الموارد",
    photosCount: (n: number) => `${n} صورة مرفقة في المنصة`, none: "—", steps: { prepare: "أعدّه", review: "راجعه", approve: "اعتمده" }, done: "تم", waiting: "لم يتم", summary: "ملخص اليوم" } as const;
const EN = { title: "Daily report", no: "No.", date: "Date", weather: "Weather", temp: "Temperature (°C)", wind: "Wind", hours: "Working hours", s: ["0) Header", "1) Labour", "2) Equipment", "3) Work done", "4) Inspections", "5) Materials received", "6) Safety", "7) Obstacles", "8) Plan for tomorrow", "9) Photos", "10) Approval"],
    company: "Company", trade: "Trade", day: "Day", night: "Night", total: "Total", cumulative: "Cumulative man-days", machine: "Machine", count: "Count", unit: "Unit", activity: "Activity", status: "Status", notes: "Notes",
    submitted: "Submitted", approved: "Approved", rejected: "Rejected", pending: "Pending", material: "Material", qty: "Quantity", supplier: "Supplier", kind: "Kind", desc: "Description", people: "People", action: "Action", issue: "Obstacle", impact: "Impact", responsible: "Responsible", due: "Due", area: "Area", resources: "Resources",
    photosCount: (n: number) => `${n} photo(s) attached on the platform`, none: "—", steps: { prepare: "Prepared", review: "Reviewed", approve: "Approved" }, done: "Done", waiting: "Not yet", summary: "Summary of the day" } as const;
// Urdu takes the English words, as the Excel export does
const W = { ar: AR, en: EN, ur: EN };
const words = (language: Lang) => W[language];

const cell: React.CSSProperties = { border: "1px solid silver", padding: "4px 6px", fontSize: 12, verticalAlign: "top" };
const head: React.CSSProperties = { ...cell, background: "gainsboro", fontWeight: 700 };
const h2: React.CSSProperties = { fontSize: 15, margin: "14px 0 6px", fontWeight: 700 };
const show = (value: unknown): React.ReactNode => (React.isValidElement(value) ? value : value === null || value === undefined || value === "" ? "—" : typeof value === "number" ? formatNumber(value, Number.isInteger(value) ? 0 : 2) : String(value));
const dayOf = (value: Date | string) => new Date(new Date(value).getTime() + 3 * 3600e3).toISOString().slice(0, 10);

function Table({ headers, rows }: { headers: string[]; rows: unknown[][] }) {
  if (rows.length === 0) return <p style={{ fontSize: 12, margin: 0 }}>—</p>;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr>{headers.map(header => <th key={header} style={head}>{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} style={cell}>{show(value)}</td>)}</tr>)}</tbody>
    </table>
  );
}

export const DailyReportDocument = React.forwardRef<HTMLElement, { data: ReportForDocument; language: Lang; projectName?: string; unitNumber: (id: string | null) => string; activityName: (id: string | null) => string }>(
  function DailyReportDocument({ data, language, projectName, unitNumber, activityName }, ref) {
    const w = words(language);
    const r = data.report;
    const tally = (t: { submitted: number; approved: number; rejected: number; pending: number }) => [t.submitted, t.approved, t.rejected, t.pending];
    return (
      <article ref={ref} dir={language === "en" ? "ltr" : "rtl"} lang={language} data-report-document style={{ background: "white", color: "black", width: 760, padding: 16, fontFamily: "Tahoma, Arial, sans-serif" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{w.title}{projectName ? ` — ${projectName}` : ""}</h1>
        <h2 style={h2}>{w.s[0]}</h2>
        <Table headers={[w.no, w.date, w.weather, w.temp, w.wind, w.hours]} rows={[[r.reportNumber, r.reportDate, r.weather, r.temperatureC === null || r.temperatureC === undefined ? null : Number(r.temperatureC), r.wind, r.workHours]]} />
        {r.summary ? <p style={{ fontSize: 12 }}><b>{w.summary}: </b>{r.summary}</p> : null}
        <h2 style={h2}>{w.s[1]}</h2>
        <Table headers={[w.company, w.trade, w.day, w.night]} rows={(data.labour ?? []).map(row => [row.companyName, row.roleName, row.shift === "day" ? row.headcount : null, row.shift === "night" ? row.headcount : null])} />
        {data.totals ? <p style={{ fontSize: 12 }} data-doc-labour-total>{w.total}: {formatNumber(data.totals.labour.total)} ({w.day} {formatNumber(data.totals.labour.day)} · {w.night} {formatNumber(data.totals.labour.night)}) · {w.cumulative}: {formatNumber(data.totals.cumulativeManDays)}</p> : null}
        <Table headers={[w.trade, w.count, w.hours]} rows={(data.lines ?? []).filter(line => line.lineType === "labour").map(line => [line.label, line.quantity, line.hours])} />
        <h2 style={h2}>{w.s[2]}</h2>
        <Table headers={[w.machine, w.count, w.hours]} rows={[...(data.equipment ?? []).map(row => [[row.equipmentType, row.model, row.plateOrSize].filter(Boolean).join(" · "), row.count, row.hours]), ...(data.lines ?? []).filter(line => line.lineType === "equipment").map(line => [line.label, line.quantity, null])]} />
        <h2 style={h2}>{w.s[3]}</h2>
        <Table headers={[w.unit, w.activity, w.status, w.notes]} rows={(data.lines ?? []).filter(line => line.lineType === "work").map(line => [unitNumber(line.pmcUnitId), activityName(line.pmcActivityDefinitionId), line.reportedStatus, line.description])} />
        <h2 style={h2}>{w.s[4]}</h2>
        {data.inspections ? <Table headers={["", w.submitted, w.approved, w.rejected, w.pending]} rows={[["WIR", ...tally(data.inspections.wir)], ["RFI", ...tally(data.inspections.rfi)]]} /> : <p>—</p>}
        <h2 style={h2}>{w.s[5]}</h2>
        <Table headers={[w.material, w.qty, w.unit, w.supplier]} rows={(data.materials ?? []).map(row => [row.material, row.quantity, row.unit, row.supplier])} />
        <h2 style={h2}>{w.s[6]}</h2>
        <Table headers={[w.kind, w.desc, w.people, w.action]} rows={(data.hse ?? []).map(row => [row.kind, row.description, row.peopleCount, row.actionTaken])} />
        <h2 style={h2}>{w.s[7]}</h2>
        <Table headers={[w.issue, w.impact, w.responsible, w.action, w.due]} rows={(data.obstacleItems ?? []).map(row => [row.issue, row.impact, row.responsible, row.action, row.dueDate])} />
        {r.obstacles ? <p style={{ fontSize: 12 }}>{r.obstacles}</p> : null}
        <h2 style={h2}>{w.s[8]}</h2>
        <Table headers={[w.area, w.activity, w.qty, w.unit, w.resources]} rows={(data.tomorrow ?? []).map(row => [row.area, row.activity, row.quantity, row.unit, row.resources])} />
        <h2 style={h2}>{w.s[9]}</h2>
        <p style={{ fontSize: 12 }}>{w.photosCount((data.photos ?? []).length)}</p>
        <h2 style={h2}>{w.s[10]}</h2>
        <Table headers={["", w.status]} rows={(["prepare", "review", "approve"] as const).map(step => [w.steps[step], data.approval?.[step]?.at ? <span>{w.done} <span dir="ltr">{dayOf(data.approval[step].at!)}</span></span> : w.waiting])} />
      </article>
    );
  },
);

/** The Word file: the document's HTML in Word's HTML dialect, downloaded as .doc (Word opens it, right-to-left kept). The name stays ASCII (see pdfFileName). */
export function downloadWord(element: HTMLElement, fileBase: string, stamp: Date = new Date()): string {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${fileBase}</title></head><body>${element.outerHTML}</body></html>`;
  const name = `${fileBase.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report"}-${stamp.toISOString().slice(0, 10)}.doc`;
  const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

const BAR = {
  ar: { title: "تصدير التقرير", pdf: "تنزيل PDF", word: "تنزيل Word", excel: "ورقة العمالة Excel", busy: "جارٍ التجهيز…", done: (name: string) => `نُزِّل: ${name}`, failed: "تعذّر التصدير. حاول مجددًا." },
  en: { title: "Export the report", pdf: "Download PDF", word: "Download Word", excel: "Labour sheet (Excel)", busy: "Preparing…", done: (name: string) => `Downloaded: ${name}`, failed: "The export failed. Try again." },
  ur: { title: "رپورٹ برآمد کریں", pdf: "PDF ڈاؤن لوڈ", word: "Word ڈاؤن لوڈ", excel: "لیبر شیٹ (Excel)", busy: "تیار ہو رہا ہے…", done: (name: string) => `ڈاؤن لوڈ ہوا: ${name}`, failed: "برآمد نہیں ہو سکی۔ دوبارہ کوشش کریں۔" },
};

/** The three exports of a saved report: PDF and Word drawn from the document above in the browser, the labour sheet written by the server (siteReports.export). */
export function ReportExports(props: { language: Lang; fileBase: string; documentRef: React.RefObject<HTMLElement | null>; onExcel: () => Promise<{ url: string; fileName: string }>; buttonClass: string }) {
  const t = BAR[props.language];
  const [state, setState] = React.useState<{ kind: "busy" | "done" | "failed"; name?: string } | null>(null);
  const run = async (task: () => Promise<string>) => {
    setState({ kind: "busy" });
    try { setState({ kind: "done", name: await task() }); } catch { setState({ kind: "failed" }); }
  };
  const pdf = () => run(async () => {
    const element = props.documentRef.current;
    if (!element) throw new Error("no document");
    const { exportElementToPdf } = await import("@/lib/pdfExport");
    return exportElementToPdf(element, props.fileBase, "portrait");
  });
  const word = () => run(async () => {
    const element = props.documentRef.current;
    if (!element) throw new Error("no document");
    return downloadWord(element, props.fileBase);
  });
  const excel = () => run(async () => {
    const file = await props.onExcel();
    const link = document.createElement("a");
    link.href = file.url; link.download = file.fileName; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove();
    return file.fileName;
  });
  const busy = state?.kind === "busy";
  return (
    <section aria-label={t.title} className="space-y-2 rounded-xl border bg-card p-3" data-report-exports>
      <h2 className="text-base font-semibold">{t.title}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" className={props.buttonClass} disabled={busy} onClick={() => { void pdf(); }}>{t.pdf}</button>
        <button type="button" className={props.buttonClass} disabled={busy} onClick={() => { void word(); }}>{t.word}</button>
        <button type="button" className={props.buttonClass} disabled={busy} onClick={() => { void excel(); }}>{t.excel}</button>
      </div>
      {state?.kind === "busy" && <p role="status" className="text-sm text-muted-foreground">{t.busy}</p>}
      {state?.kind === "done" && <p role="status" className="text-sm text-success-soft-foreground">{t.done(state.name ?? "")}</p>}
      {state?.kind === "failed" && <p role="alert" className="text-sm text-danger-soft-foreground">{t.failed}</p>}
    </section>
  );
}
