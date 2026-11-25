// Q-59 (2): what needs the person's attention today, on the project board — daily reports waiting for approval, stalled villas, open NCRs, high and
// critical risks. Each figure comes from the read its own page makes, behind that page's permission, and opens that page; a figure the person may not
// see, or whose read failed, says so («—» with the reason), never 0. Read-only.
import React from "react";
import { Link } from "wouter";
import { AlertTriangle, ClipboardCheck, FileText, PauseCircle, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { formatNumber } from "@/components/ds/format";

const text = {
  ar: { title: "ما يحتاج انتباهك اليوم", reports: "تقارير يومية تنتظر الاعتماد", stalled: "وحدات متوقفة", ncrs: "عدم مطابقة مفتوحة (NCR)", risks: "مخاطر عالية وحرجة", hidden: "لا صلاحية لعرضه", failed: "تعذّر تحميل المصدر", clear: "لا شيء ينتظر" },
  en: { title: "Needs your attention today", reports: "Daily reports awaiting approval", stalled: "Stalled units", ncrs: "Open non-conformances (NCR)", risks: "High and critical risks", hidden: "Not visible to you", failed: "The source could not be loaded", clear: "Nothing waiting" },
  ur: { title: "آج آپ کی توجہ درکار", reports: "منظوری کی منتظر یومیہ رپورٹس", stalled: "رکے ہوئے یونٹس", ncrs: "کھلے عدم مطابقت (NCR)", risks: "بلند اور سنگین خطرات", hidden: "آپ کے لیے نظر نہیں آتا", failed: "ماخذ لوڈ نہ ہو سکا", clear: "کچھ منتظر نہیں" },
};

/** NCR states that still need work (everything but closed and cancelled). */
export const OPEN_NCR = new Set(["open", "under_investigation", "corrective_action", "verification"]);

type Figure = { key: string; label: string; icon: LucideIcon; value: number | null; allowed: boolean; failed: boolean; href: string };

export function ProjectBoardAttention({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const base = `/projects/${tenantId}/${projectId}`;
  const can = { reports: useCanPage("dailyReport", projectId), stalled: useCanPage("stalled", projectId), quality: useCanPage("quality", projectId), risks: useCanPage("risks", projectId) };
  const reports = trpc.siteReports.list.useQuery({ ...scope, status: "submitted" }, { enabled: can.reports, staleTime: 60_000 });
  const stalled = trpc.pmc.stalledUnits.useQuery(scope, { enabled: can.stalled, staleTime: 60_000 });
  const ncrs = trpc.ncrs.list.useQuery(scope, { enabled: can.quality, staleTime: 60_000 });
  const risks = trpc.pmo.projectRisks.useQuery(scope, { enabled: can.risks, staleTime: 60_000 });
  const figures: Figure[] = [
    { key: "reports", label: t.reports, icon: FileText, allowed: can.reports, failed: Boolean(reports.error), value: reports.data ? reports.data.length : null, href: `${base}/site` },
    { key: "stalled", label: t.stalled, icon: PauseCircle, allowed: can.stalled, failed: Boolean(stalled.error), value: stalled.data ? stalled.data.counts.stalled + stalled.data.counts.long : null, href: `${base}/stalled` },
    { key: "ncrs", label: t.ncrs, icon: ClipboardCheck, allowed: can.quality, failed: Boolean(ncrs.error), value: ncrs.data ? ncrs.data.filter(item => OPEN_NCR.has(String(item.status))).length : null, href: `${base}/quality` },
    { key: "risks", label: t.risks, icon: AlertTriangle, allowed: can.risks, failed: Boolean(risks.error), value: risks.data ? risks.data.matrix.byLevel.high + risks.data.matrix.byLevel.critical : null, href: `${base}/risks` },
  ];
  return (
    <section aria-labelledby="board-attention-title" data-board-attention className="rounded-[18px] border border-border bg-card p-5">
      <h2 id="board-attention-title" className="text-base font-semibold">{t.title}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {figures.map(({ key, label, icon: Icon, value, allowed, failed, href }) => {
          const note = !allowed ? t.hidden : failed ? t.failed : value === 0 ? t.clear : null;
          const body = <>
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Icon aria-hidden className="h-4 w-4 shrink-0" />{label}</span>
            <span data-attention-value className={`text-3xl font-bold tabular-nums ${value ? "text-status-late" : "text-foreground"}`} dir="ltr">{allowed && !failed && value !== null ? formatNumber(value) : "—"}</span>
            {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
          </>;
          const cls = "flex min-h-28 flex-col justify-between gap-2 rounded-[14px] border border-border p-4";
          return <li key={key} data-attention={key}>{allowed ? <Link href={href} className={`${cls} hover:border-primary`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}
