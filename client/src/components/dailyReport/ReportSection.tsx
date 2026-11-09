import React from "react";
import { ChevronDown, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// One numbered part of the daily report (specification §3, sections 0 to 10). Open by default so a phone shows the whole report in order;
// the number stays beside the title so the planning engineer and the site engineer speak of "section 3" alike.
export function ReportSection({ number, title, summary, children, defaultOpen = true }: { number: number; title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} data-report-section={number} className="group rounded-xl border bg-card">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 px-3 py-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold" aria-hidden="true">{number}</span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{summary ? <span className="block text-xs text-muted-foreground">{summary}</span> : null}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t px-3 py-3">{children}</div>
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
