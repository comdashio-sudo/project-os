import React from "react";
import { ArrowDown } from "lucide-react";
import { Link } from "wouter";
import { formatAmount, formatNumber } from "@/components/ds/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOptionalLanguage } from "@/contexts/optionalLanguage";
import { isRtlLanguage, pickLanguage, resolveLanguage } from "@/lib/language";
import { LEVEL_IDS, LEVEL_NAMES, levelBelow, levelHref, type LevelId } from "@/lib/levels";

// The one layout the four level dashboards share (work order 13, item 6): where the person is (level n of 4), the one-click link to the
// level below, and the screen's own sections. The navigation bar is the server's own (`navigation.get`) for the matching context.


const copy = {
  ar: { level: "المستوى", of: "من", down: (name: string) => `انتقل إلى مستوى: ${name}`, lowest: "أدنى مستوى: لا مستوى تحته.", label: "المستويات", chooseProject: "انتقل إلى مشروع", chooseLabel: "المشاريع في هذا المستوى" },
  en: { level: "Level", of: "of", down: (name: string) => `Go to the level: ${name}`, lowest: "This is the lowest level.", label: "Levels", chooseProject: "Go to a project", chooseLabel: "Projects in this level" },
  ur: { level: "سطح", of: "میں سے", down: (name: string) => `${name} سطح پر جائیں`, lowest: "یہ سب سے نچلی سطح ہے۔", label: "سطحیں", chooseProject: "پروجیکٹ پر جائیں", chooseLabel: "اس سطح کے پروجیکٹ" },
};

/** One link below this level, for a level that descends to several places (the portfolio: one link per project of the comparison). */
export type BelowLink = { id: string; label: string; href: string };

export function LevelDashboard({ level, tenantId, projectId, title, belowHref, belowLinks, children }: {
  level: LevelId;
  tenantId: string;
  projectId?: string;
  title: string;
  /** Overrides the default link down; `null` removes the link. */
  belowHref?: string | null;
  /** When given, the screen chooses where to go down: one link per place (the portfolio's projects), and no single link. */
  belowLinks?: readonly BelowLink[];
  children: React.ReactNode;
}) {
  const { isArabic } = useLanguage();
  const language = useOptionalLanguage() ?? resolveLanguage(isArabic);
  const isRtl = isRtlLanguage(language);
  const t = copy[language];
  const names = LEVEL_NAMES[level];
  const below = levelBelow(level);
  const href = belowHref !== undefined ? belowHref : below ? levelHref(tenantId, below, projectId) : null;
  return <main dir={isRtl ? "rtl" : "ltr"} lang={language} data-level={level} className="text-foreground">
    <div className="flex flex-col gap-5 [&>*]:min-w-0">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-primary" data-level-position>{`${t.level} ${LEVEL_IDS.indexOf(level) + 1} ${t.of} ${LEVEL_IDS.length} · ${names[language]}`}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {belowLinks && belowLinks.length > 0 && below
          ? <nav aria-label={t.chooseLabel} data-level-down="" className="flex flex-wrap gap-2">
              {belowLinks.map(link => <Link key={link.id} href={link.href} data-level-down-item={link.id} className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                <span>{`${t.chooseProject}: ${link.label}`}</span>
              </Link>)}
            </nav>
          : below && href
          ? <Link href={href} data-level-down="" className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
              <span>{t.down(LEVEL_NAMES[below][language])}</span>
            </Link>
          : below === null ? <p className="text-sm text-muted-foreground" data-level-lowest="">{t.lowest}</p> : null}
      </header>
      {children}
    </div>
  </main>;
}

export function LevelSection({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section aria-labelledby={id} data-section={id} className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="font-semibold">{title}</h2>
      {action}
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

/** A figure the server computed as unavailable for this project (not a missing route): said plainly, not as a zero. */
export function NotAvailable({ isArabic }: { isArabic: boolean }) {
  const language = useOptionalLanguage() ?? resolveLanguage(isArabic);
  return <span className="text-muted-foreground">{pickLanguage(language, { ar: "غير متاح", en: "Not available", ur: "دستیاب نہیں" })}</span>;
}

export function formatMoney(value: number, currency: string | null | undefined): string {
  const digits = formatAmount(value);
  return currency ? `${digits} ${currency}` : digits;
}
export const formatIndex = (value: number | null | undefined) => value === null || value === undefined ? "—" : formatNumber(value, 2);
export const formatPercent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${formatNumber(value, 1)}%`;
