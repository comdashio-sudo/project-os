// Q-59 (3): the quick search — Ctrl+K (⌘K) or the search button in the top bar. It finds a page of the side menu by its name (the menu the server
// already filtered for this person), and, on a project, a villa by its number, a daily report by its date and an activity by its code, from the server
// (search.quick, each source behind its own screen's gate). Enter opens the first result; the arrows move through them.
import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, FileText, Home, Search, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

/** the keys, the same in every language */
const SHORTCUT = "Ctrl K";
const text = {
  ar: { open: "بحث", title: "بحث سريع", placeholder: "صفحة، أو رقم فيلا، أو تاريخ تقرير 2026-11-20، أو رمز نشاط", pages: "الصفحات", villas: "الفلل", reports: "التقارير اليومية", activities: "الأنشطة", none: "لا نتائج", searching: "جارٍ البحث…", failed: "تعذّر البحث في بيانات المشروع؛ الصفحات ما زالت تظهر" },
  en: { open: "Search", title: "Quick search", placeholder: "A page, a villa number, a report date 2026-11-20, or an activity code", pages: "Pages", villas: "Villas", reports: "Daily reports", activities: "Activities", none: "No results", searching: "Searching…", failed: "The project's data could not be searched; pages still show" },
  ur: { open: "تلاش", title: "فوری تلاش", placeholder: "صفحہ، ولا نمبر، رپورٹ کی تاریخ 2026-11-20، یا سرگرمی کا کوڈ", pages: "صفحات", villas: "ولاز", reports: "یومیہ رپورٹس", activities: "سرگرمیاں", none: "کوئی نتیجہ نہیں", searching: "تلاش جاری ہے…", failed: "منصوبے کے ڈیٹا میں تلاش نہ ہو سکی؛ صفحات اب بھی دکھائی دیتے ہیں" },
};

export type SearchPage = { id: string; label: string; href?: string };
type Result = { key: string; group: "pages" | "villas" | "reports" | "activities"; label: string; detail: string | null; href: string };
const ICONS: Record<Result["group"], LucideIcon> = { pages: FileText, villas: Home, reports: CalendarDays, activities: Search };

/** The menu's pages whose name holds what was typed (letters and digits only, case ignored) */
export function matchPages(pages: SearchPage[], query: string): SearchPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages.filter(page => page.href && page.label.toLowerCase().includes(q)).slice(0, 8);
}

export function QuickSearch({ tenantId, projectId, pages, onOpen }: { tenantId: string; projectId?: string; pages: SearchPage[]; onOpen: (href: string) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [active, setActive] = React.useState(0);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  React.useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  React.useEffect(() => { if (!open) { setQuery(""); setDebounced(""); } }, [open]);
  const remote = trpc.search.quick.useQuery({ tenantId, projectId: projectId ?? "", query: debounced }, { enabled: open && Boolean(projectId) && debounced.length > 0, staleTime: 30_000 });
  const results: Result[] = [
    ...matchPages(pages, query).map(page => ({ key: `page:${page.id}`, group: "pages" as const, label: page.label, detail: null, href: page.href! })),
    ...(debounced === query.trim() ? (remote.data?.hits ?? []) : []).map((hit, index) => ({ key: `${hit.kind}:${index}:${hit.label}`, group: (hit.kind === "villa" ? "villas" : hit.kind === "report" ? "reports" : "activities") as Result["group"], label: hit.label, detail: hit.detail, href: hit.href })),
  ];
  // the selection goes back to the first result when the results themselves change
  const resultKey = results.map(result => result.key).join("|");
  React.useEffect(() => { setActive(0); }, [resultKey]);
  const choose = (result: Result | undefined) => { if (!result) return; setOpen(false); onOpen(result.href); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(index + 1, Math.max(results.length - 1, 0))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label={t.open} data-quick-search-open className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius)] px-2 text-sm text-muted-foreground hover:bg-muted md:border md:border-border md:px-3">
          <Search className="h-5 w-5" aria-hidden="true" /><span className="hidden md:inline">{t.open}</span><kbd className="hidden rounded border border-border px-1 text-[11px] md:inline" dir="ltr">{SHORTCUT}</kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40" />
        <Dialog.Content aria-describedby={undefined} data-quick-search className="fixed inset-x-4 top-[10vh] z-50 mx-auto max-w-xl overflow-hidden rounded-[18px] border border-border bg-card shadow-lg">
          <Dialog.Title className="sr-only">{t.title}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={t.placeholder} aria-label={t.title} role="combobox" aria-expanded={results.length > 0} aria-controls="quick-search-results"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
          </div>
          <ul id="quick-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {results.map((result, index) => {
              const Icon = ICONS[result.group]; const heading = index === 0 || results[index - 1].group !== result.group ? t[result.group] : null;
              return <li key={result.key} role="presentation">
                {heading ? <p className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{heading}</p> : null}
                <a href={result.href} role="option" aria-selected={index === active} data-quick-result={result.group} onClick={event => { event.preventDefault(); choose(result); }} onMouseEnter={() => setActive(index)}
                  className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm ${index === active ? "bg-muted" : ""}`}>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 truncate"><bdi>{result.label}</bdi></span>
                  {result.detail ? <span className="max-w-[45%] truncate text-xs text-muted-foreground"><bdi>{result.detail}</bdi></span> : null}
                </a>
              </li>;
            })}
            {query.trim() && !results.length ? <li className="px-3 py-4 text-sm text-muted-foreground" data-quick-none>{remote.isFetching ? t.searching : t.none}</li> : null}
            {remote.error ? <li className="px-3 py-2 text-xs text-muted-foreground" role="note">{t.failed}</li> : null}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
