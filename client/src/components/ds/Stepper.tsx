import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "./format";
import { useDsText } from "./strings";

export type Step = { id: string; label: string; description?: string };

/** Steps with a state each (done / current / upcoming). From the phone breakpoint down it collapses to "Step 2 of 4", the current label and a bar -- four labelled circles do not fit in 390px. */
export function Stepper({ steps, current, onSelect, label }: { steps: Step[]; current: number; onSelect?: (index: number) => void; label: string }) {
  const text = useDsText();
  return (
    <nav aria-label={label}>
      <div className="md:hidden">
        <p className="text-xs font-medium text-muted-foreground">{text.stepOf} {formatNumber(current + 1)} {text.of} {formatNumber(steps.length)}</p>
        <p className="mt-0.5 text-base font-semibold">{steps[current]?.label}</p>
        <div className="mt-2 flex gap-1" aria-hidden="true">{steps.map((step, index) => <span key={step.id} className={cn("h-1.5 flex-1 rounded-full", index <= current ? "bg-primary" : "bg-muted")} />)}</div>
      </div>
      <ol className="hidden items-start md:flex">
        {steps.map((step, index) => {
          const done = index < current; const active = index === current;
          const marker = <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold", done && "border-primary bg-primary text-primary-foreground", active && "border-primary bg-card text-primary", !done && !active && "border-border bg-card text-muted-foreground")}>{done ? <Check className="h-4 w-4" aria-hidden="true" /> : formatNumber(index + 1)}</span>;
          const body = <span className="flex min-w-0 flex-col text-start"><span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>{step.description ? <span className="text-xs text-muted-foreground">{step.description}</span> : null}{done ? <span className="sr-only">{text.done}</span> : null}</span>;
          return (
            <li key={step.id} aria-current={active ? "step" : undefined} className="flex flex-1 items-start last:flex-none">
              {onSelect && done ? <button type="button" onClick={() => onSelect(index)} className="flex items-center gap-3 rounded-[var(--radius)]">{marker}{body}</button> : <span className="flex items-center gap-3">{marker}{body}</span>}
              {index < steps.length - 1 ? <span aria-hidden="true" className={cn("mx-3 mt-4 h-0.5 flex-1 rounded-full", done ? "bg-primary" : "bg-border")} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
