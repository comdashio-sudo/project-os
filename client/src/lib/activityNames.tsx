import React, { useCallback, useEffect, useState } from "react";
import { Segmented } from "@/components/ds/Segmented";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// Q-49: which language the ACTIVITY names are shown in — Arabic or English — independent of the interface language. Display only: nothing is saved on the
// server and no data changes. The default follows the interface (English → English; Arabic and Urdu → Arabic), and a person's choice is kept on this
// device for that signed-in person. A name missing in the chosen language shows the other one, marked, never a blank.
export type ActivityNameLanguage = "ar" | "en";
const storageKey = (userId: number | string | undefined) => `project-os-activity-names:${userId ?? "anonymous"}`;
const read = (userId: number | string | undefined): ActivityNameLanguage | null => {
  try { const value = localStorage.getItem(storageKey(userId)); return value === "ar" || value === "en" ? value : null; } catch { return null; }
};
export const defaultActivityNameLanguage = (language: Language): ActivityNameLanguage => (language === "en" ? "en" : "ar");

export function useActivityNameLanguage(): [ActivityNameLanguage, (value: ActivityNameLanguage) => void] {
  const { language } = useLanguage();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const userId = me.data?.id;
  const [stored, setStored] = useState<ActivityNameLanguage | null>(() => read(userId));
  useEffect(() => { setStored(read(userId)); }, [userId]);
  const choose = (value: ActivityNameLanguage) => {
    setStored(value);
    try { localStorage.setItem(storageKey(userId), value); } catch { /* storage closed or full: the choice holds for this visit */ }
  };
  return [stored ?? defaultActivityNameLanguage(language), choose];
}

/** The name in the chosen language; `otherLanguage` says it fell back to the other one (none in the chosen language). */
export function activityName(item: { name: string; nameEn?: string | null }, choice: ActivityNameLanguage): { text: string; otherLanguage: boolean } {
  const english = item.nameEn?.trim();
  if (choice === "en") return english ? { text: english, otherLanguage: false } : { text: item.name, otherLanguage: true };
  return item.name.trim() ? { text: item.name, otherLanguage: false } : { text: english ?? "", otherLanguage: Boolean(english) };
}

const text = {
  ar: { label: "أسماء الأنشطة", arabic: "العربية", english: "English", inArabic: "بالعربية", inEnglish: "بالإنجليزية" },
  en: { label: "Activity names", arabic: "العربية", english: "English", inArabic: "in Arabic", inEnglish: "in English" },
  ur: { label: "سرگرمیوں کے نام", arabic: "عربی", english: "انگریزی", inArabic: "عربی میں", inEnglish: "انگریزی میں" },
};

/** The switch «أسماء الأنشطة: العربية | English», 44px targets. */
export function ActivityNameToggle({ value, onChange }: { value: ActivityNameLanguage; onChange: (value: ActivityNameLanguage) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-activity-name-toggle>
      <span className="text-muted-foreground">{t.label}</span>
      <Segmented label={t.label} value={value} onValueChange={next => onChange(next === "en" ? "en" : "ar")} options={[{ value: "ar", label: t.arabic }, { value: "en", label: t.english }]} />
    </div>
  );
}

/**
 * A name as text with a light mark when it is the other language's (e.g. «صب القواعد · بالعربية» while English is chosen). `active` false (the project has
 * no English name at all) shows every name as stored, unmarked: there is nothing to switch, and marking every name would only be noise. `mark` false (a
 * section, a stage) gives the chosen language's text without the mark.
 */
export function useActivityLabel(choice: ActivityNameLanguage, active: boolean) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  return useCallback((item: { name: string; nameEn?: string | null }, mark = true) => {
    if (!active) return item.name;
    const shown = activityName(item, choice);
    return shown.otherLanguage && mark ? `${shown.text} · ${choice === "en" ? t.inArabic : t.inEnglish}` : shown.text;
  }, [active, choice, t]);
}

/** Whether a list of activities has any English name: the names switch is offered only then. */
export const hasEnglishNames = (items: ReadonlyArray<{ nameEn?: string | null }> | undefined) => Boolean(items?.some(item => item.nameEn?.trim()));
