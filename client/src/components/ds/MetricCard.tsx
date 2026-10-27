import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "./Badge";
import { useDsText } from "./strings";

/**
 * An indicator: its name, its number and its status, nothing else on the face (work order 21). How it is calculated (the formula, the source,
 * the date it stands at) is folded under "How is it calculated?", one click away. The status is a word, never a colour alone.
 */
export function MetricCard({ label, value, status, detail, how, className }: {
  label: string; value: React.ReactNode; status?: { tone: BadgeTone; label: string }; detail?: React.ReactNode; how?: React.ReactNode; className?: string;
}) {
  const text = useDsText();
  return (
    <div data-metric className={cn("flex min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4 text-card-foreground", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p>{status ? <Badge tone={status.tone}>{status.label}</Badge> : null}</div>
      <p className="break-words text-2xl font-semibold tabular-nums leading-tight">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {how ? (
        <details className="group text-xs">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-medium text-primary"><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />{text.howCalculated}</summary>
          <div className="mt-1 leading-5 text-muted-foreground">{how}</div>
        </details>
      ) : null}
    </div>
  );
}
