import React from "react";
import { ChevronDown, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// One numbered part of the daily report. Q-58 (2): the numbers are the paper report's (1 header … 10 photos, then ✓ review and send) and the section is found by its
// key (`data-report-section="work"`), not by its number. Open by default; on a phone only the section in hand is drawn (`onPhone`), a desk shows them all.
export function ReportSection({ sectionKey, number, title, summary, children, defaultOpen = true, onPhone = true, required, footer }: {
  sectionKey: string; number: number | string; title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean; onPhone?: boolean; required?: string; footer?: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} id={`report-section-${sectionKey}`} data-report-section={sectionKey} data-section-number={number} data-current={onPhone ? "" : undefined}
      className={`group scroll-mt-20 rounded-xl border bg-card ${onPhone ? "" : "max-lg:hidden"}`}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 px-3 py-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">{number}</span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">{title}{required ? <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-normal text-warning-soft-foreground" data-required>{required}</span> : null}</span>{summary ? <span className="block text-xs text-muted-foreground">{summary}</span> : null}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t px-3 py-3">{children}{footer}</div>
    </details>
  );
}

const lockedText = {
  ar: "يُفعَّل بعد تحديث الخادم. لا يُرسل هذا القسم شيئًا بعد.",
  en: "Turns on after the server update. This section sends nothing yet.",
  ur: "سرور کی تازہ کاری کے بعد فعال ہوگا۔ یہ حصہ ابھی کچھ نہیں بھیجتا۔",
};

/** A part of the report whose server side is not built yet (D-45): drawn, named and closed, with no field and no made-up figure. */
export function LockedNote() {
  const { language } = useLanguage();
  return <p role="note" data-locked-section className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{pickLanguage(language, lockedText)}</p>;
}
