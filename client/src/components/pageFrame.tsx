import React, { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

// A page inside the product frame (ProductShell) must not draw a second frame: the frame owns the one <main>, the one top bar (<header>, the banner)
// and the one language switch (work order 21 step 1; code review of #156, item 2). The same pages still open on their own in tests and in the
// unframed routes, where they keep their own landmarks. These three pieces choose by the context ProductShell provides.
const InShellContext = createContext(false);

export function InShellProvider({ children }: { children: React.ReactNode }) {
  return <InShellContext.Provider value>{children}</InShellContext.Provider>;
}

export function useInShell() {
  return useContext(InShellContext);
}

type BlockProps = React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode };

/** The page's root. Alone: <main>. Inside the frame: a plain block without its own page background or full-screen height (the frame has both). */
export function PageMain({ className, ...rest }: BlockProps) {
  // Q-59 (6): «w-full» — a page root with «mx-auto» inside the frame's column would otherwise shrink to its widest child (auto margins stop the
  // stretch), so on a phone a wide table pushed the whole page past the screen's left edge (the weekly report at 390px)
  if (useInShell()) return <div data-page-root="" {...rest} className={cn(className, "min-h-0 w-full bg-transparent")} />;
  return <main {...rest} className={className} />;
}

/** The page's top row. Alone: <header>. Inside the frame: a toolbar row in the content, without the bar's border and background. */
export function PageHeader({ className, ...rest }: BlockProps) {
  if (useInShell()) return <div data-page-toolbar="" {...rest} className={cn(className, "border-0 bg-transparent shadow-none")} />;
  return <header {...rest} className={className} />;
}

/** Drawn only when the page is not inside the frame (for example a second logo the frame already shows). */
export function OutsideShell({ children }: { children: React.ReactNode }) {
  return useInShell() ? null : <>{children}</>;
}

/**
 * Q-59 (4): the one head of a page — its title, ONE line that says what the page is for, the page's own buttons in one place (new, save, …) and,
 * under them, its filter bar. The frame's toolbar row above every page already holds the export to Excel and the print (Q-57), so a page does not
 * draw those again. The content follows. `actions` and `filters` are optional; a page with neither is just its title and its line.
 */
export function PageTitle({ title, description, actions, filters, eyebrow, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; filters?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <PageHeader data-page-title="" className={cn("flex flex-col gap-3 pb-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow ? <p className="text-xs font-semibold text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description ? <p data-page-description="" className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div data-page-buttons="" className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
      </div>
      {filters ? <div data-page-filters="" role="group" className="flex flex-wrap items-end gap-3 rounded-[14px] border border-border bg-card p-3 print:hidden">{filters}</div> : null}
    </PageHeader>
  );
}
