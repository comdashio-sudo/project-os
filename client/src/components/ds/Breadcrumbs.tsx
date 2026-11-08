import React from "react";
import { ChevronRight } from "lucide-react";
import { useDsText } from "./strings";

export type Crumb = { label: string; href?: string };

/** Where you are: the last item is the page itself (aria-current); the separators mirror in right-to-left. On a phone only the last two show. */
export function Breadcrumbs({ items, onNavigate }: { items: Crumb[]; onNavigate?: (href: string) => void }) {
  const text = useDsText();
  return (
    <nav aria-label={text.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={`items-center gap-1.5 ${items.length - index > 2 ? "hidden md:flex" : "flex"}`}>
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" /> : null}
              {last || !item.href ? <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-foreground" : ""}>{item.label}</span>
                : <a href={item.href} onClick={event => { if (onNavigate) { event.preventDefault(); onNavigate(item.href!); } }} className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground hover:underline md:min-h-0">{item.label}</a>}
            </li>);
        })}
      </ol>
    </nav>
  );
}
