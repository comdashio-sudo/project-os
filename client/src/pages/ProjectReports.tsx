import React from "react";
import { Link, useParams } from "wouter";
import { CalendarDays, CalendarRange, GitCompare, type LucideIcon } from "lucide-react";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { PAGE_NAMES } from "@shared/pageNames";

const text = {
  ar: { intro: "تقارير المشروع في مكان واحد. كل رقم فيها من بيانات المشروع، وتُصدَّر من صفحتها.", weekly: "الأسبوع من اليوميات: الأرقام والصور والنصوص المقترحة، ثم التصدير.", monthly: "الشهر: أرقامه ومنحنى S (البرنامج مقابل اليوميات) والمعالم.", comparison: "الإنجاز كما يراه الموقع والاستشاري والتقرير الشهري، والفروق بينها.", nothing: "لا تملك صلاحية فتح أي من تقارير هذا المشروع." },
  en: { intro: "The project's reports in one place. Every figure comes from the project's data, and each report exports from its page.", weekly: "The week from the daily reports: figures, photos and suggested texts, then the export.", monthly: "The month: its figures, the S-curve (programme against the daily reports) and milestones.", comparison: "Progress as the site, the consultant and the monthly report see it, and the gaps between them.", nothing: "You may not open any of this project's reports." },
  ur: { intro: "منصوبے کی رپورٹس ایک جگہ۔ ہر عدد منصوبے کے ڈیٹا سے ہے، اور ہر رپورٹ اپنے صفحے سے برآمد ہوتی ہے۔", weekly: "روزانہ رپورٹس سے ہفتہ: اعداد، تصاویر اور تجویز کردہ متن، پھر برآمد۔", monthly: "مہینہ: اس کے اعداد، S-منحنی (پروگرام بمقابلہ روزانہ رپورٹس) اور سنگ میل۔", comparison: "سائٹ، کنسلٹنٹ اور ماہانہ رپورٹ کے مطابق پیش رفت، اور ان کے فرق۔", nothing: "آپ اس منصوبے کی کوئی رپورٹ نہیں کھول سکتے۔" },
};

function ReportCard({ icon: Icon, title, href, children, testId }: { icon: LucideIcon; title: string; href: string; children: React.ReactNode; testId: string }) {
  return (
    <li data-report-card={testId}>
      <Link href={href} className="flex min-h-11 h-full flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden className="h-5 w-5 text-muted-foreground" />{title}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </Link>
    </li>
  );
}

/**
 * Q-36 (step 2 c, docs/proposals/navigation.md §3.1): «التقارير» — the weekly report, the monthly report and the site ↔ consultant comparison, each a card
 * for whoever may open that page (shared/pageAccess.ts REPORTS_HUB_PAGES). Nothing is read or written here: each report reads its own figures.
 */
export default function ProjectReports() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const name = (key: keyof typeof PAGE_NAMES) => pickLanguage(language, PAGE_NAMES[key]);
  const can = { weekly: useCanPage("weeklyReport", projectId), monthly: useCanPage("monthlyReport", projectId), comparison: useCanPage("siteConsultant", projectId) };
  const base = `/projects/${tenantId}/${projectId}`;
  return (
    <PageMain className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeader><h1 className="text-2xl font-semibold">{name("reports")}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
      {can.weekly || can.monthly || can.comparison ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-report-cards>
          {can.weekly ? <ReportCard testId="weekly" icon={CalendarDays} title={name("weeklyReport")} href={`${base}/weekly-report`}>{t.weekly}</ReportCard> : null}
          {can.monthly ? <ReportCard testId="monthly" icon={CalendarRange} title={name("monthlyReport")} href={`${base}/monthly-report`}>{t.monthly}</ReportCard> : null}
          {can.comparison ? <ReportCard testId="comparison" icon={GitCompare} title={name("siteConsultant")} href={`${base}/site-consultant`}>{t.comparison}</ReportCard> : null}
        </ul>
      ) : <p role="note" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">{t.nothing}</p>}
    </PageMain>
  );
}
