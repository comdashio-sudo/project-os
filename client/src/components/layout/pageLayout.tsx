// Q-69: the page layout every screen shares, so «everything in one line, I scroll to the end» stops. Four pieces:
//   TwoPane         — on a laptop (≥1024 px) two columns: the main work and its live companion (a form and its preview, a list and its details);
//                     on a phone one column, the main work first.
//   StickyActionBar — the page's primary action fixed at the bottom of the screen (the safe area of a phone respected), always reachable.
//   SectionNav      — for a page longer than two screens: a row of its sections that stays at the top and jumps to each (scrolls sideways on a phone).
//   EntityCombobox  — any choice among existing records (an activity, a block, a villa) is a searchable list, never a free text field.
// Layout only: no data, no permission, nothing written.
import React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
export function StickyActionBar({ children, summary }: { children: React.ReactNode; summary?: React.ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="h-20 print:hidden" />
      <div data-sticky-action-bar="" role="region" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 backdrop-blur print:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
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

export type EntityOption = { value: string; label: string; hint?: string; group?: string; keywords?: string[] };
/**
 * A choice among existing records: type any part of the code, the name or a keyword to narrow it; grouped when the options carry a group; works by touch and
 * keyboard. `recent` values are offered first, under their own heading.
 */
export function EntityCombobox({ options, value, onChange, placeholder, searchPlaceholder, emptyText, recentLabel, recent = [], label, disabled }: {
  options: EntityOption[]; value: string | null; onChange: (value: string) => void; placeholder: string; searchPlaceholder: string; emptyText: string;
  recentLabel?: string; recent?: string[]; label: string; disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find(option => option.value === value) ?? null;
  const recentOptions = recent.map(item => options.find(option => option.value === item)).filter((option): option is EntityOption => Boolean(option));
  const groups = new Map<string, EntityOption[]>();
  for (const option of options) { const key = option.group ?? ""; groups.set(key, [...(groups.get(key) ?? []), option]); }
  const item = (option: EntityOption, prefix: string) => (
    <CommandItem key={`${prefix}:${option.value}`} value={`${prefix}:${option.value}`} keywords={[option.label, option.value, ...(option.keywords ?? [])]} onSelect={() => { onChange(option.value); setOpen(false); }} className="min-h-11">
      <Check aria-hidden="true" className={cn("h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate"><bdi>{option.label}</bdi></span>
      {option.hint ? <span className="shrink-0 text-xs text-muted-foreground"><bdi>{option.hint}</bdi></span> : null}
    </CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-label={label} disabled={disabled} data-entity-combobox="" className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius)] border border-input bg-card px-3 text-start text-sm disabled:opacity-50">
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}><bdi>{selected ? selected.label : placeholder}</bdi></span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {recentOptions.length ? <CommandGroup heading={recentLabel}>{recentOptions.map(option => item(option, "recent"))}</CommandGroup> : null}
            {Array.from(groups.entries()).map(([group, list]) => <CommandGroup key={group || "all"} heading={group || undefined}>{list.map(option => item(option, "all"))}</CommandGroup>)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
