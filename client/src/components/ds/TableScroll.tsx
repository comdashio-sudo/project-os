import React from "react";
import { cn } from "@/lib/utils";
import { useDsText } from "./strings";

/**
 * A wide table on a narrow screen: it scrolls sideways inside its own frame (never the page), says so when it does, keeps its first column in
 * place, and never wraps or clips a value (a figure such as "-57,446.81 SAR" stays whole). The hint and the edge fade appear only while the
 * table is wider than its frame, so a desktop that fits it sees nothing extra. While it scrolls the frame is focusable so a keyboard can scroll it too.
 */
export function TableScroll({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const text = useDsText();
  const ref = React.useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = React.useState(false);
  // D-76 (a): the frame AND what it holds are watched — rows that arrive after the first draw widen the table, not the frame — and a table replaced
  // by another (a new query, a tab) is watched in its turn (the MutationObserver re-attaches to the frame's new child).
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setOverflows(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    const watch = () => { observer.disconnect(); observer.observe(node); Array.from(node.children).forEach(child => observer.observe(child)); measure(); };
    watch();
    const swapped = typeof MutationObserver === "undefined" ? null : new MutationObserver(watch);
    swapped?.observe(node, { childList: true });
    return () => { observer.disconnect(); swapped?.disconnect(); };
  }, []);
  return (
    <div className={cn("relative min-w-0", className)} data-table-scroll={overflows ? "overflows" : "fits"}>
      {/* D-76 (b): the fade sits over the frame only, so it never covers the hint line below it */}
      <div className="relative">
        {/* D-76 (c): a keyboard stop only while there is something to scroll */}
        <div ref={ref} role="region" aria-label={label} tabIndex={overflows ? 0 : undefined}
          className="overflow-x-auto rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_td]:whitespace-nowrap [&_tr>*:first-child]:sticky [&_tr>*:first-child]:start-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-card">
          {children}
        </div>
        {overflows ? <div aria-hidden="true" data-table-fade className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-card to-transparent rtl:bg-gradient-to-r" /> : null}
      </div>
      {/* review of #254: Nastaliq (Urdu) runs taller than its line box, so the hint keeps a line height that does not reach into what follows */}
      {overflows ? <p className="mt-1 pb-1 text-xs leading-6 text-muted-foreground">{text.scrollSideways}</p> : null}
    </div>
  );
}
