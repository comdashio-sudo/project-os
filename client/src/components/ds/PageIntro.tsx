import React from "react";
import { ChevronDown } from "lucide-react";
import { useDsText } from "./strings";

/** The least text that works: a title, ONE line that says what the screen is for, and everything else folded under "Learn more". */
export const INTRO_MAX_CHARS = 120;

export function PageIntro({ title, summary, details, actions }: { title: string; summary: string; details?: React.ReactNode; actions?: React.ReactNode }) {
  const text = useDsText();
  if (summary.length > INTRO_MAX_CHARS && typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    throw new Error(`PageIntro summary is ${summary.length} characters (limit ${INTRO_MAX_CHARS}): keep one line and move the rest into "details"`);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1><p data-intro className="mt-1 text-sm text-muted-foreground">{summary}</p></div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {details ? <details data-learn-more className="group text-sm"><summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-medium text-primary"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />{text.learnMore}</summary><div className="mt-2 max-w-prose text-muted-foreground">{details}</div></details> : null}
    </div>
  );
}
