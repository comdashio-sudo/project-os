// Q-67 (1)(2): one searchable list for choosing from the project's own data (an activity of the weights table, one or more blocks, a phase): a button that
// opens a search field over the options, grouped (the activity's section, Q01…), with «last used» first. Works with touch and the keyboard (arrows, Enter,
// Esc), and with screen readers (combobox → listbox → option). One choice, or several when `multiple` (the button then says how many are chosen).
import React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/ds/Field";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

export type ComboOption = { value: string; label: string; /** shown before the label, left-to-right (a code) */ code?: string; description?: string; group?: string; /** extra words the search also finds */ keywords?: string };
const LIMIT = 200;
const text = {
  ar: { search: "ابحث…", none: "لا نتائج", recent: "آخر ما استخدمت", more: (n: number) => `${n} أخرى — اكتب للتضييق`, chosen: (n: number) => `${n} مختارة`, clear: "مسح الاختيار" },
  en: { search: "Search…", none: "No results", recent: "Last used", more: (n: number) => `${n} more — type to narrow`, chosen: (n: number) => `${n} chosen`, clear: "Clear the choice" },
  ur: { search: "تلاش کریں…", none: "کوئی نتیجہ نہیں", recent: "آخری استعمال شدہ", more: (n: number) => `${n} مزید — محدود کرنے کے لیے لکھیں`, chosen: (n: number) => `${n} منتخب`, clear: "انتخاب صاف کریں" },
};

/** The options whose code, label, description or keywords hold every word typed (case ignored), in their order; Arabic and Latin alike. */
export function matchOptions(options: ComboOption[], query: string): ComboOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter(option => { const hay = `${option.code ?? ""} ${option.label} ${option.description ?? ""} ${option.group ?? ""} ${option.keywords ?? ""}`.toLowerCase(); return words.every(word => hay.includes(word)); });
}

export function SearchCombobox({ id, options, value, values, onChange, onChangeMany, multiple, recent = [], placeholder, disabled, invalid, "aria-label": ariaLabel, "aria-describedby": describedBy, "data-combobox": dataName }: {
  id?: string; options: ComboOption[]; value?: string; values?: string[]; onChange?: (value: string) => void; onChangeMany?: (values: string[]) => void; multiple?: boolean;
  recent?: string[]; placeholder?: string; disabled?: boolean; invalid?: boolean; "aria-label"?: string; "aria-describedby"?: string; "data-combobox"?: string;
}) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const chosen = React.useMemo(() => new Set(multiple ? values ?? [] : value ? [value] : []), [multiple, values, value]);
  // «last used» first (only while nothing is typed), then every option in its own group
  const shown = React.useMemo(() => {
    const found = matchOptions(options, query);
    if (query.trim() || !recent.length) return found;
    const byValue = new Map(options.map(option => [option.value, option]));
    const first = recent.map(item => byValue.get(item)).filter((option): option is ComboOption => Boolean(option)).map(option => ({ ...option, group: t.recent, key: `recent:${option.value}` }));
    return [...first, ...found];
  }, [options, query, recent, t.recent]);
  const visible = shown.slice(0, LIMIT);
  React.useEffect(() => { setActive(0); }, [query, open]);
  React.useEffect(() => { if (!open) setQuery(""); }, [open]);

  const pick = (option: ComboOption | undefined) => {
    if (!option) return;
    if (multiple) { const next = new Set(chosen); if (next.has(option.value)) next.delete(option.value); else next.add(option.value); onChangeMany?.(options.map(item => item.value).filter(item => next.has(item))); }
    else { onChange?.(option.value); setOpen(false); }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(index + 1, Math.max(visible.length - 1, 0))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); pick(visible[active]); }
  };
  const selected = options.find(option => option.value === value);
  const chosenLabels = multiple ? options.filter(option => chosen.has(option.value)).map(option => option.label) : [];
  // up to three chosen are named; more are counted
  const label = multiple ? (chosenLabels.length && chosenLabels.length <= 3 ? chosenLabels.join(language === "en" ? ", " : "، ") : chosen.size ? t.chosen(chosen.size) : undefined) : selected ? `${selected.code ? `${selected.code} — ` : ""}${selected.label}` : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" id={id} role="combobox"
          // a combobox takes no name from its text: inside a Field its <label for=id> names it; a list with no label (the field bar's unit list) is named by its placeholder
          aria-label={ariaLabel ?? (id ? undefined : placeholder)} aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" aria-describedby={describedBy} aria-invalid={invalid || undefined} data-combobox={dataName}
          className={cn(controlClass(invalid), "flex min-h-11 w-full items-center justify-between gap-2 text-start md:min-h-10", !label && "text-muted-foreground")}>
          <span className="min-w-0 truncate">{label ?? placeholder}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} collisionPadding={8} onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).querySelector("input")?.focus(); }}
          className="z-50 flex max-h-[min(70vh,28rem)] w-[var(--radix-popover-trigger-width)] min-w-[16rem] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={t.search} aria-label={placeholder ?? t.search} aria-controls={listId}
              aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined} className="min-h-11 w-full bg-transparent text-sm outline-none" />
          </div>
          <ul id={listId} role="listbox" aria-multiselectable={multiple || undefined} className="flex-1 overflow-y-auto p-1">
            {!visible.length && <li className="px-3 py-2 text-sm text-muted-foreground">{t.none}</li>}
            {visible.map((option, index) => {
              const showGroup = option.group && option.group !== visible[index - 1]?.group;
              const isChosen = chosen.has(option.value);
              return (
                <React.Fragment key={(option as ComboOption & { key?: string }).key ?? option.value}>
                  {showGroup && <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{option.group}</li>}
                  <li id={`${listId}-${index}`} role="option" aria-selected={isChosen} data-value={option.value} onMouseEnter={() => setActive(index)} onClick={() => pick(option)}
                    className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-sm md:min-h-10", index === active && "bg-accent text-accent-foreground")}>
                    <Check className={cn("h-4 w-4 shrink-0", isChosen ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-baseline gap-2">{option.code ? <bdi dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">{option.code}</bdi> : null}<span className="truncate">{option.label}</span></span>
                      {option.description ? <span className="truncate text-xs text-muted-foreground">{option.description}</span> : null}
                    </span>
                  </li>
                </React.Fragment>
              );
            })}
            {shown.length > LIMIT && <li className="px-3 py-2 text-xs text-muted-foreground">{t.more(shown.length - LIMIT)}</li>}
          </ul>
          {multiple && chosen.size > 0 && <button type="button" onClick={() => onChangeMany?.([])} className="min-h-11 border-t border-border text-sm text-primary">{t.clear}</button>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
