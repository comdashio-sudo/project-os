// Q-19 (3): the project board's hero card — the weighted progress of the project (the site's PMC weights) against the plan, on the dark hero surface.
// One read (pmcSite.curve, project.pmc.read). No villas or no plan: the card is left out, never a made-up number.
import React from "react";
import { formatPercent } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

const noCurve = (_input: { tenantId: string; projectId: string }) => ({ data: undefined as undefined | { points: Point[]; today: string; actualToDate: number } });

type Point = { month: string; plannedCumulative: number | null; actualCumulative: number | null };

/** The plan at today: the last planned month that has started (fractions 0–1). */
export function plannedToDate(points: Point[], today: string): number | null {
  const started = points.filter(point => point.month <= today && point.plannedCumulative !== null);
  return started.length ? started[started.length - 1].plannedCumulative : null;
}

const text = {
  ar: { title: "الإنجاز الموزون للمشروع", toDate: "حتى اليوم", planned: "المخطط", points: "نقطة", actual: "الفعلي", line: "الخط الأبيض = المخطط", noPlan: "لا خطة مستوردة بعد" },
  en: { title: "Weighted project progress", toDate: "To date", planned: "Planned", points: "pts", actual: "Actual", line: "White line = planned", noPlan: "No plan imported yet" },
  ur: { title: "پروجیکٹ کی وزنی پیش رفت", toDate: "آج تک", planned: "منصوبہ", points: "پوائنٹس", actual: "اصل", line: "سفید لکیر = منصوبہ", noPlan: "ابھی کوئی منصوبہ درآمد نہیں ہوا" },
};

export function ProjectHero({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  // a host that has no curve read (a narrow test double, an older client) draws no card rather than failing the page
  const query = (trpc.pmcSite?.curve?.useQuery ?? noCurve)({ tenantId, projectId });
  if (!query.data || !query.data.points.length) return null;
  const actual = Math.max(0, Math.min(1, query.data.actualToDate));
  const planned = plannedToDate(query.data.points, query.data.today);
  const delta = planned === null ? null : (actual - planned) * 100;
  return (
    <section aria-label={t.title} data-testid="project-hero" className="flex flex-col gap-5 rounded-[var(--radius-card)] bg-hero p-6 text-hero-foreground">
      <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-medium text-hero-muted">{t.title}</h2><span className="text-xs text-hero-muted">{t.toDate}</span></div>
      <div className="flex flex-wrap items-end gap-4">
        <p dir="ltr" className="font-bold leading-none tabular-nums text-6xl md:text-7xl" data-testid="project-hero-actual">{formatPercent(actual * 100, 1)}</p>
        <div className="flex flex-col gap-1 pb-1 text-sm">
          <span className="text-hero-muted">{planned === null ? t.noPlan : <>{t.planned} <bdi dir="ltr">{formatPercent(planned * 100, 1)}</bdi></>}</span>
          {delta !== null ? <span className={`font-semibold tabular-nums ${delta < 0 ? "text-hero-behind" : "text-sidebar-mark"}`} data-testid="project-hero-delta"><bdi dir="ltr">{`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatPercent(Math.abs(delta), 1).replace("%", "")}`}</bdi> {t.points}</span> : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="relative h-3 overflow-hidden rounded-full bg-hero-track" role="img" aria-label={`${t.actual} ${formatPercent(actual * 100, 1)}${planned === null ? "" : ` · ${t.planned} ${formatPercent(planned * 100, 1)}`}`}>
          <div className="absolute inset-y-0 start-0 rounded-full bg-sidebar-mark" style={{ width: `${actual * 100}%` }} />
          {planned !== null ? <div aria-hidden="true" className="absolute -inset-y-0.5 w-0.5 bg-white" style={{ insetInlineStart: `${Math.min(1, planned) * 100}%` }} /> : null}
        </div>
        <div className="flex justify-between text-xs text-hero-muted"><span>{t.actual}</span>{planned !== null ? <span>{t.line}</span> : null}</div>
      </div>
    </section>
  );
}
