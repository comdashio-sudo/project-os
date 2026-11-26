import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ds";
import { formatDate, formatNumber } from "@/components/ds/format";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { buildWbsTree, searchWbsTree, visibleWbsRows, type WbsActivity, type WbsItem } from "@/lib/wbsTree";

/** While searching, at most this many rows are drawn: the person narrows the text rather than scroll a thousand lines. */
const SEARCH_ROW_CAP = 200;

/**
 * Q-64: the work structure as a tree. The first level is open; each node says how many items sit under it, how many activities it holds and its dates; a search by code or
 * name keeps the matches and the path to them. A planned value or a progress of zero that nobody measured is not shown as «0.00%».
 */
export function WbsTree({ items, activities, empty }: { items: readonly WbsItem[]; activities: readonly WbsActivity[]; empty: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { search: "ابحث برقم البند أو اسمه", children: "بندًا فرعيًا", activities: "نشاطًا", planned: "القيمة المخططة", progress: "الإنجاز", open: "افتح", close: "اطوِ", none: "لا بند يطابق البحث", capped: (shown: number, found: number) => `يظهر أول ${shown} من ${found} تطابقًا: ضيّق البحث لترى الباقي.`, matches: (n: number) => `${n} تطابقًا` },
    en: { search: "Search by item code or name", children: "sub-items", activities: "activities", planned: "Planned value", progress: "Progress", open: "Open", close: "Collapse", none: "No item matches the search", capped: (shown: number, found: number) => `Showing the first ${shown} of ${found} matches: narrow the search to see the rest.`, matches: (n: number) => `${n} matches` },
    ur: { search: "شق کے کوڈ یا نام سے تلاش کریں", children: "ذیلی شقیں", activities: "سرگرمیاں", planned: "منصوبہ بند قدر", progress: "پیش رفت", open: "کھولیں", close: "سمیٹیں", none: "تلاش سے کوئی شق نہیں ملتی", capped: (shown: number, found: number) => `${found} میں سے پہلی ${shown} ملتی جلتی شقیں: باقی دیکھنے کے لیے تلاش کو تنگ کریں۔`, matches: (n: number) => `${n} ملتی جلتی شقیں` },
  });
  const roots = React.useMemo(() => buildWbsTree(items, activities), [items, activities]);
  const [query, setQuery] = React.useState("");
  const [opened, setOpened] = React.useState<ReadonlySet<string>>(new Set());
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(new Set());
  const search = React.useMemo(() => searchWbsTree(roots, query), [roots, query]);
  const rows = React.useMemo(() => visibleWbsRows(roots, { open: opened, closed, visible: search.visible, firstLevelOpen: true }), [roots, opened, closed, search.visible]);
  const shown = search.visible ? rows.slice(0, SEARCH_ROW_CAP) : rows;
  const toggle = (id: string, isOpen: boolean) => {
    const add = (set: ReadonlySet<string>) => new Set(Array.from(set).concat(id)); const drop = (set: ReadonlySet<string>) => new Set(Array.from(set).filter(item => item !== id));
    if (isOpen) { setOpened(drop); setClosed(add); } else { setOpened(add); setClosed(drop); }
  };
  if (!items.length) return <p className="mt-5 text-sm text-muted-foreground">{empty}</p>;
  return <div className="mt-5" data-wbs-tree="">
    <Input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)} className="max-w-md" />
    {search.visible ? <p role="status" className="mt-2 text-xs text-muted-foreground">{search.matches ? t.matches(search.matches) : t.none}</p> : null}
    <ul role="tree" aria-label={t.search} className="mt-3 divide-y rounded-xl border">
      {shown.map(({ node, depth, open }) => {
        const { item } = node; const planned = Number(item.plannedValue ?? 0); const progress = Number(item.progressPercent ?? 0);
        const meta = [
          node.children.length ? `${formatNumber(node.children.length)} ${t.children}` : null,
          node.activities ? `${formatNumber(node.activities)} ${t.activities}` : null,
          node.start || node.finish ? `${node.start ? formatDate(node.start, language) : "—"} — ${node.finish ? formatDate(node.finish, language) : "—"}` : null,
          planned > 0 ? `${t.planned}: ${formatNumber(planned, 0)}` : null,
        ].filter(Boolean).join(" · ");
        return <li key={item.id} role="treeitem" aria-level={depth + 1} aria-expanded={node.children.length ? open : undefined} data-wbs-row="" className="flex items-start justify-between gap-3 p-3" style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}>
          <div className="flex min-w-0 items-start gap-2">
            {node.children.length ? <button type="button" aria-label={`${open ? t.close : t.open}: ${item.code}`} className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" onClick={() => toggle(item.id, open)}>{open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />}</button> : <span className="inline-block h-6 w-6 shrink-0" />}
            <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.code} · {item.name}</p>{meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}</div>
          </div>
          {progress > 0 ? <Badge tone="neutral">{formatNumber(progress, 2)}%</Badge> : null}
        </li>;
      })}
    </ul>
    {search.visible && rows.length > SEARCH_ROW_CAP ? <p className="mt-2 text-xs text-muted-foreground">{t.capped(SEARCH_ROW_CAP, rows.length)}</p> : null}
  </div>;
}
