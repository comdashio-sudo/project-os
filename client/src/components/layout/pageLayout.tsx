// Q-69: the page layout every screen shares, so «everything in one line, I scroll to the end» stops. Four pieces:
//   TwoPane         — on a laptop (≥1024 px) two columns: the main work and its live companion (a form and its preview, a list and its details);
//                     on a phone one column, the main work first.
//   StickyActionBar — the page's primary action fixed at the bottom of the screen (the safe area of a phone respected), always reachable.
//   SectionNav      — for a page longer than two screens: a row of its sections that stays at the top and jumps to each (scrolls sideways on a phone).
//   A choice among existing records uses the shared SearchCombobox (client/src/components/SearchCombobox.tsx), never a second picker.
// Layout only: no data, no permission, nothing written.
import React from "react";
import { cn } from "@/lib/utils";

export function TwoPane({ main, aside, asideLabel, className }: { main: React.ReactNode; aside?: React.ReactNode; asideLabel?: string; className?: string }) {
  if (!aside) return <div data-two-pane="" className={cn("min-w-0", className)}>{main}</div>;
  return (
    <div data-two-pane="" className={cn("grid min-w-0 gap-4 lg:grid-cols-12", className)}>
      <div data-pane="main" className="min-w-0 lg:col-span-7">{main}</div>
      <aside data-pane="aside" aria-label={asideLabel} className="min-w-0 lg:col-span-5 lg:sticky lg:top-4 lg:self-start">{aside}</aside>
    </div>
  );
}

/** The page's primary action, fixed at the bottom. Leaves room under the page so the bar never covers its last line. */
export function StickyActionBar({ children, summary, label }: { children: React.ReactNode; summary?: React.ReactNode; label?: string }) {
  return (
    <>
      <div aria-hidden="true" className="h-20 print:hidden" />
      <div data-sticky-action-bar="" role={label ? "region" : undefined} aria-label={label} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 backdrop-blur print:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          {summary ? <p className="min-w-0 flex-1 text-sm" data-action-summary="">{summary}</p> : <span />}
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </>
  );
}

export type Section = { id: string; label: string };
/** The sections of a long page, kept at the top; a tap scrolls to the section. */
export function SectionNav({ sections, label }: { sections: Section[]; label: string }) {
  if (sections.length < 2) return null;
  return (
    <nav aria-label={label} data-section-nav="" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur print:hidden">
      <ul className="flex min-w-max gap-1 py-2">
        {sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="inline-flex min-h-11 items-center rounded-[var(--radius)] px-3 text-sm font-medium hover:bg-muted">{section.label}</a></li>)}
      </ul>
    </nav>
  );
}
