import React from "react";
import { Link, useParams } from "wouter";
import { ClipboardCheck, FileText, PauseCircle, TrendingUp, type LucideIcon } from "lucide-react";
import { Badge, Card, CardBody } from "@/components/ds";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { PAGE_NAMES } from "@shared/pageNames";

/** The site's calendar day (Riyadh, UTC+3): the day a report is filed for and a QC receipt is dated by. */
export const siteToday = (now = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
/** The most QC events the card reads (pmc.qcHistory's own ceiling): a full page means there may be more, and the card says «100+» rather than a short count. */
const QC_PAGE = 100;
const dayOf = (value: unknown) => (value instanceof Date ? siteToday(value) : typeof value === "string" ? value.slice(0, 10) : "");

const text = {
  ar: { intro: "شاشات الموقع في مكان واحد: افتح ما تحتاجه اليوم، والعدد على كل بطاقة من بيانات المشروع.", todayReport: "تقرير اليوم", none: "لم يُبدأ", draft: "مسودة", submitted: "بانتظار الاعتماد", approved: "معتمد", rejected: "مُعاد", awaiting: "تقارير بانتظار الاعتماد", activities: "نشاطًا في جدول الأوزان", today: "استلامًا مسجّلًا اليوم", stalled: "متوقفة", long: "متوقفة طويلًا", nothing: "لا تملك صلاحية فتح أي من شاشات الموقع في هذا المشروع.", open: "فتح" },
  en: { intro: "The site's screens in one place: open what you need today; each card's number comes from the project's data.", todayReport: "Today's report", none: "Not started", draft: "Draft", submitted: "Awaiting approval", approved: "Approved", rejected: "Returned", awaiting: "reports awaiting approval", activities: "activities in the weights table", today: "receipts recorded today", stalled: "stalled", long: "long stalled", nothing: "You may not open any of the site's screens in this project.", open: "Open" },
  ur: { intro: "سائٹ کی اسکرینیں ایک جگہ: آج جو چاہیے کھولیں؛ ہر کارڈ کا عدد منصوبے کے ڈیٹا سے ہے۔", todayReport: "آج کی رپورٹ", none: "شروع نہیں ہوئی", draft: "مسودہ", submitted: "منظوری کی منتظر", approved: "منظور شدہ", rejected: "واپس کی گئی", awaiting: "رپورٹیں منظوری کی منتظر", activities: "سرگرمیاں وزن کی جدول میں", today: "وصولیاں آج درج ہوئیں", stalled: "رکی ہوئی", long: "طویل رکی ہوئی", nothing: "آپ اس منصوبے میں سائٹ کی کوئی اسکرین نہیں کھول سکتے۔", open: "کھولیں" },
};

function SiteCard({ icon: Icon, title, href, children, testId }: { icon: LucideIcon; title: string; href: string; children: React.ReactNode; testId: string }) {
  return (
    <li data-site-card={testId}>
      <Link href={href} className="flex min-h-11 h-full flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden className="h-5 w-5 text-muted-foreground" />{title}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{children}</span>
      </Link>
    </li>
  );
}

/**
 * Q-36 (step 2 b, adviser's decision §6.2): «الموقع والتنفيذ» — the daily report, the progress update, the QC receipt and the stalled units, each a card with
 * its count, for whoever may open that page (shared/pageAccess.ts: the card's own gate; its read is not even made otherwise). Nothing is written here.
 */
export default function ProjectSite() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const name = (key: keyof typeof PAGE_NAMES) => pickLanguage(language, PAGE_NAMES[key]);
  const scope = { tenantId, projectId };
  const can = { dailyReport: useCanPage("dailyReport", projectId), progress: useCanPage("progress", projectId), qc: useCanPage("qc", projectId), stalled: useCanPage("stalled", projectId) };
  const reports = trpc.siteReports.list.useQuery(scope, { enabled: can.dailyReport });
  const activities = trpc.pmc.progressActivities.useQuery(scope, { enabled: can.progress });
  const receipts = trpc.pmc.qcHistory.useQuery({ ...scope, limit: QC_PAGE }, { enabled: can.qc });
  const stalled = trpc.pmc.stalledUnits.useQuery(scope, { enabled: can.stalled });
  const today = siteToday();
  const todayReport = reports.data?.find(report => dayOf(report.reportDate) === today);
  // siteReports.list returns the latest 60 reports; a report still awaiting approval after 60 newer ones is not counted (rare: one report a day)
  const awaiting = reports.data?.filter(report => report.status === "submitted").length ?? 0;
  // pmc.qcHistory returns CHANGE events, newest first: count only those that marked a villa received (not an undo), RECORDED today at the site (`at`, not
  // the receipt date the engineer typed); a full page may hide older ones of today, so it reads «100+» (review of #410 by programmer A)
  const qcEvents = receipts.data ?? [];
  const receivedToday = qcEvents.filter(event => event.to === true && dayOf(event.at) === today).length;
  const cutToday = qcEvents.length >= QC_PAGE && dayOf(qcEvents[qcEvents.length - 1].at) === today; // the oldest on a full page is still today's
  const receivedTodayLabel = cutToday ? `${receivedToday}+` : null;
  const count = (value: number) => <bdi dir="ltr" className="font-semibold text-foreground">{value}</bdi>;
  const any = can.dailyReport || can.progress || can.qc || can.stalled;

  return (
    <PageMain className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeader><h1 className="text-2xl font-semibold">{name("site")}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
      {can.dailyReport ? <SourceNotice query={reports} isArabic={isArabic} title={name("dailyReport")} /> : null}
      {can.progress ? <SourceNotice query={activities} isArabic={isArabic} title={name("progress")} /> : null}
      {can.qc ? <SourceNotice query={receipts} isArabic={isArabic} title={name("qcReceipt")} /> : null}
      {can.stalled ? <SourceNotice query={stalled} isArabic={isArabic} title={name("stalled")} /> : null}
      {any ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-site-cards>
          {can.dailyReport ? <SiteCard testId="dailyReport" icon={FileText} title={name("dailyReport")} href={`/m/${tenantId}/${projectId}/report`}>
            <Badge tone={todayReport?.status === "approved" ? "success" : todayReport ? "warning" : "neutral"}>{t.todayReport}: {todayReport ? t[todayReport.status] : t.none}</Badge>
            {reports.data ? <span>{count(awaiting)} {t.awaiting}</span> : null}
          </SiteCard> : null}
          {can.progress ? <SiteCard testId="progress" icon={TrendingUp} title={name("progress")} href={`/m/${tenantId}/${projectId}/progress`}>
            {activities.data ? <span>{count(activities.data.length)} {t.activities}</span> : null}
          </SiteCard> : null}
          {can.qc ? <SiteCard testId="qc" icon={ClipboardCheck} title={name("qcReceipt")} href={`/m/${tenantId}/${projectId}/qc`}>
            {receipts.data ? <span>{receivedTodayLabel ? <bdi dir="ltr" className="font-semibold text-foreground">{receivedTodayLabel}</bdi> : count(receivedToday)} {t.today}</span> : null}
          </SiteCard> : null}
          {can.stalled ? <SiteCard testId="stalled" icon={PauseCircle} title={name("stalled")} href={`/projects/${tenantId}/${projectId}/stalled`}>
            {stalled.data ? <><Badge tone="warning">{count(stalled.data.counts.stalled)} {t.stalled}</Badge><Badge tone="danger">{count(stalled.data.counts.long)} {t.long}</Badge></> : null}
          </SiteCard> : null}
        </ul>
      ) : <p role="note" className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">{t.nothing}</p>}
    </PageMain>
  );
}
