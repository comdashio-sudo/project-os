import React from "react";
import { ArrowDown, Clock } from "lucide-react";
import { Link } from "wouter";
import { EnterpriseNavigation } from "@/components/EnterpriseNavigation";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { LEVEL_IDS, LEVEL_NAMES, levelBelow, levelHref, type LevelId } from "@/lib/levels";

// The one layout the four level dashboards share (work order 13, item 6): where the person is (level n of 4), the one-click link to the
// level below, and the screen's own sections. The navigation bar is the server's own (`navigation.get`) for the matching context.

const navContext: Record<LevelId, "executive" | "pmo" | "project"> = { company: "executive", portfolio: "pmo", project: "project", warehouse: "project" };

const copy = {
  ar: { level: "المستوى", of: "من", down: (name: string) => `انتقل إلى مستوى: ${name}`, lowest: "أدنى مستوى: لا مستوى تحته.", label: "المستويات" },
  en: { level: "Level", of: "of", down: (name: string) => `Go to the level: ${name}`, lowest: "This is the lowest level.", label: "Levels" },
};

export function LevelDashboard({ level, tenantId, projectId, title, belowHref, children }: {
  level: LevelId;
  tenantId: string;
  projectId?: string;
  title: string;
  /** Overrides the default link down (the portfolio's link goes to one project); `null` removes the link. */
  belowHref?: string | null;
  children: React.ReactNode;
}) {
  const { isArabic } = useLanguage();
  const t = isArabic ? copy.ar : copy.en;
  const names = LEVEL_NAMES[level];
  const below = levelBelow(level);
  const href = belowHref !== undefined ? belowHref : below ? levelHref(tenantId, below, projectId) : null;
  return <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} data-level={level} className="min-h-screen bg-[#f7f8fc] px-4 py-6 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex justify-end"><LanguageToggle /></div>
      <EnterpriseNavigation tenantId={tenantId} projectId={projectId} context={navContext[level]} />
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-[#0e6b70]" data-level-position>{`${t.level} ${LEVEL_IDS.indexOf(level) + 1} ${t.of} ${LEVEL_IDS.length} · ${isArabic ? names.ar : names.en}`}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {below && href
          ? <Link href={href} data-level-down="" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0e6b70] px-4 text-sm font-semibold text-white">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
              <span>{t.down(isArabic ? LEVEL_NAMES[below].ar : LEVEL_NAMES[below].en)}</span>
            </Link>
          : below === null ? <p className="text-sm text-slate-600" data-level-lowest="">{t.lowest}</p> : null}
      </header>
      {children}
    </div>
  </main>;
}

export function LevelSection({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section aria-labelledby={id} data-section={id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="font-semibold">{title}</h2>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

/** A figure the server does not provide on main yet. It says so in the place of the number, and never shows a zero. */
export function AwaitingServer({ isArabic, what }: { isArabic: boolean; what: string }) {
  return <p role="note" data-state="awaiting-server" className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
    <span><span className="font-semibold">{isArabic ? "بانتظار الخادم" : "Waiting for the server"}</span>{" — "}{what}</span>
  </p>;
}

/** A figure the server computed as unavailable for this project (not a missing route): said plainly, not as a zero. */
export function NotAvailable({ isArabic }: { isArabic: boolean }) {
  return <span className="text-slate-500">{isArabic ? "غير متاح" : "Not available"}</span>;
}

export function formatMoney(value: number, currency: string | null | undefined): string {
  const digits = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${digits} ${currency}` : digits;
}
export const formatIndex = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toFixed(2);
export const formatPercent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
