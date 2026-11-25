// Q-58 (2): the daily report's entry page in the order of the paper report — 1 header, 2 work done, 3 labour, 4 equipment, 5 materials received, 6 inspections,
// 7 safety, 8 obstacles, 9 tomorrow's plan, 10 photos, then review and send. A strip names every section with its state (empty, filled, or one another engineer
// fills) and takes the reader to it; on a phone one section fills the screen and «next» walks on; the page opens with «new report» and the reports with their
// state. Layout only: what is saved, who may write which section and what the server checks are unchanged.
import React from "react";
import { Check, ChevronLeft, ChevronRight, Circle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

export const SECTION_ORDER = ["header", "work", "labour", "equipment", "materials", "inspections", "hse", "obstacles", "tomorrow", "photos", "review"] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];
export type SectionState = "filled" | "empty" | "other";
/** The number a section carries on the paper report; the last step (review and send) has none. */
export const sectionNumber = (key: SectionKey): string => (key === "review" ? "✓" : String(SECTION_ORDER.indexOf(key) + 1));

const text = {
  ar: { autosaved: (time: string) => `حُفظت المسودة تلقائيًا ${time}`, autosaveHint: "تُحفظ المسودة تلقائيًا بعد كل تغيير.", strip: "أقسام التقرير", filled: "مكتمل", empty: "فارغ", other: "لمهندس آخر", next: "التالي", previous: "السابق", step: (n: number, of: number) => `القسم ${n} من ${of}`,
    title: "التقارير اليومية", newReport: "تقرير جديد", newHint: "تقرير جديد ليوم العمل؛ لليوم الواحد أكثر من تقرير (وردية أو منطقة أو مقاول).", mine: "تقاريري", none: "لا تقارير بعد — أنشئ أول تقرير.",
    draft: "مسودة", waiting: (who: string) => (who ? `بانتظار الاعتماد من ${who}` : "بانتظار الاعتماد"), approved: "معتمد", rejected: (why: string) => (why ? `أُعيد للتعديل: ${why}` : "أُعيد للتعديل"), open: "فتح", editing: "مفتوح الآن", more: "عرض الكل", or: "أو", required: "مطلوب" },
  en: { autosaved: (time: string) => `Draft saved automatically at ${time}`, autosaveHint: "The draft saves itself after each change.", strip: "Report sections", filled: "Filled", empty: "Empty", other: "Another engineer's", next: "Next", previous: "Previous", step: (n: number, of: number) => `Section ${n} of ${of}`,
    title: "Daily reports", newReport: "New report", newHint: "A new report for a work day; a day may hold more than one (a shift, an area or a contractor).", mine: "My reports", none: "No reports yet — create the first one.",
    draft: "Draft", waiting: (who: string) => (who ? `Waiting for approval by ${who}` : "Waiting for approval"), approved: "Approved", rejected: (why: string) => (why ? `Sent back: ${why}` : "Sent back"), open: "Open", editing: "Open now", more: "Show all", or: "or", required: "Required" },
  ur: { autosaved: (time: string) => `مسودہ خودکار طور پر محفوظ ہوا ${time}`, autosaveHint: "ہر تبدیلی کے بعد مسودہ خود محفوظ ہوتا ہے۔", strip: "رپورٹ کے حصے", filled: "مکمل", empty: "خالی", other: "دوسرے انجینئر کا", next: "اگلا", previous: "پچھلا", step: (n: number, of: number) => `حصہ ${n} از ${of}`,
    title: "یومیہ رپورٹس", newReport: "نئی رپورٹ", newHint: "کام کے دن کی نئی رپورٹ؛ ایک دن کی ایک سے زیادہ رپورٹس ہو سکتی ہیں (شفٹ، علاقہ یا ٹھیکیدار)۔", mine: "میری رپورٹس", none: "ابھی کوئی رپورٹ نہیں — پہلی رپورٹ بنائیں۔",
    draft: "مسودہ", waiting: (who: string) => (who ? `${who} کی منظوری کی منتظر` : "منظوری کی منتظر"), approved: "منظور شدہ", rejected: (why: string) => (why ? `واپس بھیجی گئی: ${why}` : "واپس بھیجی گئی"), open: "کھولیں", editing: "ابھی کھلی ہے", more: "سب دکھائیں", or: "یا", required: "لازمی" },
};
export const useLayoutText = () => pickLanguage(useLanguage().language, text);

/** The strip of sections: each one's number, name and state; a tap takes the reader there (on a phone it becomes the section on screen). */
export function SectionStrip({ titles, states, current, onPick }: { titles: Record<SectionKey, string>; states: Partial<Record<SectionKey, SectionState>>; current: SectionKey; onPick: (key: SectionKey) => void }) {
  const t = useLayoutText();
  return (
    <nav aria-label={t.strip} data-section-strip className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur">
      <ol className="flex gap-2">
        {SECTION_ORDER.map(key => {
          const state = states[key] ?? "empty";
          const Icon = state === "filled" ? Check : state === "other" ? UserRound : Circle;
          return (
            <li key={key} className="shrink-0">
              <button type="button" data-section-state={state} data-section-chip={key} aria-current={current === key ? "step" : undefined} onClick={() => onPick(key)}
                title={`${titles[key]} — ${state === "filled" ? t.filled : state === "other" ? t.other : t.empty}`}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm ${current === key ? "border-primary bg-primary text-primary-foreground" : state === "filled" ? "border-success-soft bg-success-soft text-success-soft-foreground" : "bg-card text-foreground"}`}>
                <span className="font-semibold">{sectionNumber(key)}</span>
                <span className="whitespace-nowrap">{titles[key]}</span>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{state === "filled" ? t.filled : state === "other" ? t.other : t.empty}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A phone's way through the report: the previous and the next section (a desk shows them all and does not draw this). */
export function StepButtons({ at, onGo }: { at: SectionKey; onGo: (key: SectionKey) => void }) {
  const t = useLayoutText(); const { language } = useLanguage();
  const index = SECTION_ORDER.indexOf(at); const previous = SECTION_ORDER[index - 1]; const next = SECTION_ORDER[index + 1];
  const Back = language === "en" ? ChevronLeft : ChevronRight; const Forward = language === "en" ? ChevronRight : ChevronLeft;
  return (
    <div className="space-y-2 border-t pt-3 lg:hidden" data-step-buttons>
      <p className="text-center text-xs text-muted-foreground">{t.step(index + 1, SECTION_ORDER.length)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-[44px]" disabled={!previous} data-section-previous onClick={() => previous && onGo(previous)}><Back className="h-4 w-4" aria-hidden="true" />{t.previous}</Button>
        <Button type="button" className="min-h-[44px]" disabled={!next} data-section-next onClick={() => next && onGo(next)}>{t.next}<Forward className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>
  );
}

export type ListedReport = { id: string; reportDate: string; reportNumber?: string | null; label?: string | null; status: string; reviewNote?: string | null; preparedByUserId?: number | null };

/** The top of the page: «new report», then the reports with what each is waiting for. */
export function ReportsHeader({ scope, reports, me, activeId, showDate, onNew, onOpen, newDisabled }: {
  scope: { tenantId: string; projectId: string }; reports: ListedReport[]; me: number | null; activeId: string | null; showDate: (day: string) => string;
  onNew: () => void; onOpen: (id: string) => void; newDisabled?: boolean;
}) {
  const t = useLayoutText();
  const [all, setAll] = React.useState(false);
  // who approves, by name (Q-56 4a: never the person who prepared the report)
  const approvers = trpc.siteReports.approvers.useQuery(scope, { retry: false, refetchOnWindowFocus: false, enabled: reports.some(report => report.status === "submitted") });
  const namesFor = (preparedBy: number | null | undefined) => {
    const names = (approvers.data?.people ?? []).filter(person => person.userId !== preparedBy).map(person => person.name ?? "—");
    return names.length > 1 ? `${names.slice(0, -1).join("، ")} ${t.or} ${names[names.length - 1]}` : names[0] ?? "";
  };
  const state = (report: ListedReport) => report.status === "draft" ? t.draft : report.status === "submitted" ? t.waiting(namesFor(report.preparedByUserId ?? me))
    : report.status === "approved" ? t.approved : t.rejected(report.reviewNote ?? "");
  const tone = (status: string) => status === "approved" ? "bg-success-soft text-success-soft-foreground" : status === "rejected" ? "bg-warning-soft text-warning-soft-foreground" : status === "submitted" ? "bg-info-soft text-info-soft-foreground" : "bg-muted text-muted-foreground";
  const shown = all ? reports : reports.slice(0, 5);
  return (
    <section aria-label={t.title} data-reports-header className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t.title}</h2>
        <Button type="button" className="min-h-[44px]" onClick={onNew} disabled={newDisabled} data-new-report>{t.newReport}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.newHint}</p>
      {reports.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : (
        <ul className="space-y-2">
          {shown.map(report => (
            <li key={report.id} data-report-status={report.status} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${activeId === report.id ? "border-primary" : ""}`}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{showDate(report.reportDate)}{report.reportNumber ? <span className="ms-2 font-normal text-muted-foreground" dir="ltr">{report.reportNumber}</span> : null}</span>
                {report.label ? <span className="block truncate text-xs text-muted-foreground">{report.label}</span> : null}
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${tone(report.status)}`} data-report-state>{state(report)}</span>
              </span>
              <Button type="button" variant="outline" className="min-h-[44px] shrink-0" disabled={activeId === report.id} onClick={() => onOpen(report.id)}>{activeId === report.id ? t.editing : t.open}</Button>
            </li>
          ))}
        </ul>
      )}
      {!all && reports.length > 5 ? <Button type="button" variant="ghost" className="min-h-[44px] w-full" onClick={() => setAll(true)}>{t.more} ({reports.length})</Button> : null}
    </section>
  );
}
