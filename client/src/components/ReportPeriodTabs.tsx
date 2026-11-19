import React from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { PAGE_NAMES } from "@shared/pageNames";

/**
 * Q-36 (step 3 b, docs/proposals/navigation.md §4): the weekly and the monthly report read as ONE page with two tabs — each keeps its own address (so no
 * link breaks), and this strip is drawn on both, with the one open marked. «Back» goes to «التقارير», the entry that gathers them (#419). A tab the
 * person may not open is not drawn (shared/pageAccess.ts weeklyReport / monthlyReport).
 */
export function ReportPeriodTabs({ tenantId, projectId, current }: { tenantId: string; projectId: string; current: "weekly" | "monthly" }) {
  const { language } = useLanguage();
  const name = (key: keyof typeof PAGE_NAMES) => pickLanguage(language, PAGE_NAMES[key]);
  const base = `/projects/${tenantId}/${projectId}`;
  const can = { weekly: useCanPage("weeklyReport", projectId), monthly: useCanPage("monthlyReport", projectId) };
  const tabs = ([["weekly", "weekly-report", "weeklyReport"], ["monthly", "monthly-report", "monthlyReport"]] as const).filter(([key]) => can[key] || key === current);
  return (
    <div className="flex flex-col gap-2 print:hidden" data-report-period-tabs={current}>
      <Link href={`${base}/reports`} className="inline-flex min-h-11 items-center text-sm text-primary">{name("reports")}</Link>
      <nav aria-label={name("reports")} className="flex flex-wrap gap-2">
        {tabs.map(([key, path, page]) => (
          <Link key={key} href={`${base}/${path}`} aria-current={key === current ? "page" : undefined} data-report-tab={key}
            className={`inline-flex min-h-11 items-center rounded-[var(--radius)] border px-4 text-sm font-medium ${key === current ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted"}`}>
            {name(page)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
