import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { PMO_SETUP_GUIDE, type PmoSetupField } from "@/lib/pmoSetupGuide";

/** Q-37 (a): the three levels and a made-up example, above the portfolio and program forms. */
export function PmoSetupIntro() {
  const { language } = useLanguage();
  return (
    <section data-pmo-setup-guide className="rounded-[var(--radius)] border border-border bg-muted/40 p-4 text-sm xl:col-span-2">
      <h3 className="font-semibold text-foreground">{PMO_SETUP_GUIDE.title[language]}</h3>
      <dl className="mt-2 grid gap-2 md:grid-cols-3">
        {PMO_SETUP_GUIDE.levels.map(level => (
          <div key={level.key} data-level={level.key}><dt className="font-medium text-foreground">{level.name[language]}</dt><dd className="text-muted-foreground">{level.text[language]}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-muted-foreground" data-pmo-setup-example>{PMO_SETUP_GUIDE.example[language]}</p>
    </section>
  );
}

/** Q-37 (a): one line under a field — whether it is required, and what it does. */
export function PmoFieldHelp({ field }: { field: PmoSetupField }) {
  const { language } = useLanguage();
  const help = PMO_SETUP_GUIDE.fields[field];
  return (
    <span data-field-help={field} className="mt-1 block text-xs font-normal text-muted-foreground">
      <span className={help.required ? "font-semibold text-foreground" : "font-semibold"}>{(help.required ? PMO_SETUP_GUIDE.required : PMO_SETUP_GUIDE.optional)[language]}</span> · {help.text[language]}
    </span>
  );
}
