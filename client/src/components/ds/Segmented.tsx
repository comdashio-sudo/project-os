import React from "react";
import { cn } from "@/lib/utils";

/**
 * A small set of mutually exclusive choices drawn as one control (radio semantics, arrow keys move).
 * `layout="grid"` is for more choices than fit a phone's width in one row (five statuses at 390px): a grid of 44px buttons instead of one squeezed strip.
 */
export function Segmented({ options, value, onValueChange, label, layout = "inline" }: { options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void; label: string; layout?: "inline" | "grid" }) {
  const move = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl" && (event.key === "ArrowRight" || event.key === "ArrowLeft");
    const next = options[(index + (rtl ? -step : step) + options.length) % options.length]; onValueChange(next.value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("rounded-[var(--radius)] border border-input bg-muted p-0.5", layout === "grid" ? "grid grid-cols-2 gap-0.5 sm:grid-cols-3" : "inline-flex")}>
      {options.map((option, index) => { const active = option.value === value; return (
        <button key={option.value} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => onValueChange(option.value)} onKeyDown={event => move(event, index)}
          className={cn("rounded-[calc(var(--radius)-2px)] px-4 text-sm font-medium transition-colors", layout === "grid" ? "min-h-11 px-2" : "min-h-10", active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>); })}
    </div>
  );
}
