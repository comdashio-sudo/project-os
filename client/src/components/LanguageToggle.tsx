import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_NAMES, LANGUAGES, pickLanguage } from "@/lib/language";
import { Languages } from "lucide-react";

/** The three-way language switch. The choice is kept in this browser only (the server stores no per-person language), so the screens that
 *  can show a note say so in words: `showNote`. */
export function LanguageToggle({ dark = false, showNote = false }: { dark?: boolean; showNote?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const note = pickLanguage(language, {
    ar: "تُحفظ اللغة على هذا الجهاز فقط، ولا تُحفظ في حسابك.",
    en: "The language is saved on this device only, not on your account.",
    ur: "زبان صرف اس آلے پر محفوظ ہوتی ہے، آپ کے اکاؤنٹ میں نہیں۔",
  });
  const groupLabel = pickLanguage(language, { ar: "لغة الواجهة", en: "Interface language", ur: "انٹرفیس کی زبان" });
  return (
    <div className="inline-flex flex-col items-end gap-1" title={note}>
      <div role="group" aria-label={groupLabel} className="inline-flex flex-wrap items-center gap-1">
        <Languages aria-hidden="true" className={dark ? "me-1 h-4 w-4 text-white" : "me-1 h-4 w-4 text-slate-500"} />
        {LANGUAGES.map(code => {
          const pressed = code === language;
          const tone = dark
            ? (pressed ? "border-white bg-white/20 text-white" : "border-white/30 bg-transparent text-white hover:bg-white/10")
            : (pressed ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50");
          return (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={pressed}
              onClick={() => setLanguage(code)}
              className={`min-h-[44px] min-w-[44px] rounded-md border px-2.5 text-sm font-medium ${tone}`}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          );
        })}
      </div>
      {showNote ? <p className={dark ? "text-xs text-white/80" : "text-xs text-slate-500"}>{note}</p> : null}
    </div>
  );
}
