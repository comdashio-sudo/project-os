import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds";
import { showDate, tap } from "@/components/FieldShell";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { reportSectionAccess, type ReportSectionAccess } from "@shared/dailyReportSections";
import { ReportSection } from "./ReportSection";
import { InspectionsSection } from "./ApprovalSections";
import { DailyReportDocument, ReportExports } from "./DailyReportDocument";
import { HseSection, MaterialsSection, sectionProblems, sectionsBody, sectionsFrom, useSectionText, type Sections } from "./ReportSections";

// Q-12 (D-43): the daily report for those who do not write the site's part. The HSE engineer writes the safety events, and the QA/QC engineer the materials
// received, into the site engineer's report of the day (a draft or a returned one); the planning engineer reads the whole report and exports it. Each sees only
// their section: the server does not send the others (siteReports.get → access), and refuses a save of a section that is not theirs (siteReports.saveSection).

const CODES = ["project.field.manage", "project.progress.manage", "project.manage", "project.hse.manage", "project.quality.manage", "project.qc.receive", "project.pmc.manage", "project.schedule.manage"] as const;

/** The same rule as the server's (shared/dailyReportSections.ts), read from the permissions the screen already holds. */
export function useReportSections(projectId: string): ReportSectionAccess {
  const held = Object.fromEntries(CODES.map(code => [code, useCan(code, projectId)])) as Record<string, boolean>; // eslint-disable-line react-hooks/rules-of-hooks -- a fixed list, same order each render
  return reportSectionAccess(code => Boolean(held[code]));
}

const text = {
  ar: { pick: "تقرير اليوم", choose: "اختر تقرير مهندس الموقع", none: "لا تقرير مفتوح بعد — يُنشئه مهندس الموقع لليوم، ثم تضيف قسمك فيه.", hint: "تكتب هنا قسمك وحده؛ بقية التقرير لمهندس الموقع.", hse: "السلامة (HSE)", qc: "المواد المستلمة والفحوصات", inspections: "الفحوصات (WIR/RFI)", save: "حفظ قسمي", saving: "جارٍ الحفظ…", saved: "حُفظ قسمك في التقرير.", locked: "أُرسل التقرير؛ لا يُعدَّل قسمك الآن.", whole: "التقرير كاملًا", draft: "مسودة", submitted: "مُرسل", approved: "معتمد", rejected: "مُعاد" },
  en: { pick: "The day's report", choose: "Choose the site engineer's report", none: "No open report yet — the site engineer creates the day's report, then you add your section to it.", hint: "You write your own section here; the rest of the report is the site engineer's.", hse: "Safety (HSE)", qc: "Materials received and inspections", inspections: "Inspections (WIR/RFI)", save: "Save my section", saving: "Saving…", saved: "Your section was saved into the report.", locked: "The report was sent; your section cannot change now.", whole: "The whole report", draft: "Draft", submitted: "Sent", approved: "Approved", rejected: "Returned" },
  ur: { pick: "دن کی رپورٹ", choose: "سائٹ انجینئر کی رپورٹ منتخب کریں", none: "ابھی کوئی کھلی رپورٹ نہیں — سائٹ انجینئر دن کی رپورٹ بناتا ہے، پھر آپ اس میں اپنا حصہ شامل کرتے ہیں۔", hint: "یہاں آپ صرف اپنا حصہ لکھتے ہیں؛ باقی رپورٹ سائٹ انجینئر کی ہے۔", hse: "حفاظت (HSE)", qc: "موصول شدہ مواد اور معائنے", inspections: "معائنے (WIR/RFI)", save: "میرا حصہ محفوظ کریں", saving: "محفوظ ہو رہا ہے…", saved: "آپ کا حصہ رپورٹ میں محفوظ ہو گیا۔", locked: "رپورٹ بھیج دی گئی؛ آپ کا حصہ اب نہیں بدل سکتا۔", whole: "پوری رپورٹ", draft: "مسودہ", submitted: "بھیجی گئی", approved: "منظور", rejected: "واپس" },
};

export function SectionOnlyReport({ tenantId, projectId, access }: { tenantId: string; projectId: string; access: ReportSectionAccess }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text); const isArabic = language === "ar"; const sectionText = useSectionText();
  const scope = { tenantId, projectId };
  const list = trpc.siteReports.list.useQuery(scope);
  const writer = access.edit.length > 0;
  // a writer adds to a report still open; a reader (the planning engineer) reads any
  const reports = (list.data ?? []).filter(report => !writer || report.status === "draft" || report.status === "rejected");
  const [reportId, setReportId] = useState<string>("");
  useEffect(() => { if (!reportId && reports[0]) setReportId(reports[0].id); }, [reports, reportId]);
  const detail = trpc.siteReports.get.useQuery({ ...scope, reportId }, { enabled: Boolean(reportId) });
  const submittals = trpc.submittals.list.useQuery({ ...scope, submittalType: "material_approval" }, { enabled: access.edit.includes("qc") });
  const [sections, setSections] = useState<Sections>(sectionsFrom({}));
  useEffect(() => { if (detail.data) setSections(sectionsFrom(detail.data)); }, [detail.data]);
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();
  const save = trpc.siteReports.saveSection.useMutation({ onSuccess: () => { setSaved(true); void utils.siteReports.get.invalidate(); } });
  const documentRef = useRef<HTMLElement | null>(null);
  const exportSheet = trpc.siteReports.export.useMutation();
  const locked = detail.data ? !["draft", "rejected"].includes(detail.data.report.status) : false;
  const status = (value: string) => (t as Record<string, string>)[value] ?? value;
  const put = <K extends "hse" | "materials">(name: K) => (rows: Sections[K]) => { setSaved(false); setSections(current => ({ ...current, [name]: rows })); };
  const send = (section: "hse" | "qc") => { setSaved(false); const body = sectionsBody(sections); save.mutate({ ...scope, reportId, section, ...(section === "hse" ? { hse: body.hse } : { materials: body.materials }) }); };
  const invalid = sectionProblems({ ...sections, obstacleItems: [], tomorrow: [] }).length > 0;

  return (
    <div className="space-y-3" data-section-only={access.edit.join(",") || "read"}>
      <SourceNotice query={list} isArabic={isArabic} title={t.pick} />
      {writer && <p className="text-sm text-muted-foreground">{t.hint}</p>}
      {list.isSuccess && reports.length === 0 ? <p role="status" className="rounded-xl bg-muted p-3 text-sm">{t.none}</p> : (
        <label className="block text-sm font-medium">{t.pick}
          <Select className="mt-1 min-h-11 md:min-h-11" value={reportId || undefined} placeholder={t.choose} onValueChange={value => { setSaved(false); setReportId(value); }}
            options={reports.map(report => ({ value: report.id, label: `\u2068${showDate(report.reportDate, language)}\u2069 · ${status(report.status)}` }))} /></label>
      )}
      {reportId && <SourceNotice query={detail} isArabic={isArabic} title={t.pick} />}
      {locked && writer && <p role="note" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t.locked}</p>}
      {detail.data && access.edit.includes("hse") && (
        <ReportSection number={6} title={t.hse}>
          <HseSection title={t.hse} rows={sections.hse} onChange={put("hse")} locked={locked} />
          {!locked && <Button type="button" className={`${tap} w-full`} disabled={invalid || save.isPending} onClick={() => send("hse")}>{save.isPending ? t.saving : t.save}</Button>}
        </ReportSection>
      )}
      {detail.data && access.edit.includes("qc") && (
        <>
          <ReportSection number={4} title={t.inspections} defaultOpen={false}><InspectionsSection inspections={detail.data.inspections} /></ReportSection>
          <ReportSection number={5} title={t.qc}>
            <SourceNotice query={submittals} isArabic={isArabic} title={sectionText.approval} />
            <MaterialsSection title={t.qc} rows={sections.materials} onChange={put("materials")} locked={locked} submittals={submittals.data ?? []} />
            {!locked && <Button type="button" className={`${tap} w-full`} disabled={invalid || save.isPending} onClick={() => send("qc")}>{save.isPending ? t.saving : t.save}</Button>}
          </ReportSection>
        </>
      )}
      {save.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(save.error, isArabic)}</p>}
      {saved && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success-soft-foreground">{t.saved}</p>}
      {detail.data && access.whole && (
        <section className="space-y-2" aria-label={t.whole}>
          <ReportExports language={language} fileBase={`daily-report-${detail.data.report.reportNumber ?? detail.data.report.reportDate}`} documentRef={documentRef} buttonClass={`${tap} rounded-xl border bg-card px-3 text-sm font-medium disabled:opacity-50`}
            onExcel={() => exportSheet.mutateAsync({ ...scope, reportId, format: "xlsx", locale: language })} />
          <div className="overflow-x-auto rounded-xl border bg-card p-2">
            <DailyReportDocument ref={documentRef} data={detail.data} language={language} unitNumber={() => "—"} activityName={() => "—"} />
          </div>
        </section>
      )}
    </div>
  );
}
