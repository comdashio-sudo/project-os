import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAccountLanguage } from "@/contexts/accountLanguage";
import { LANGUAGE_NAMES, LANGUAGES, pickLanguage } from "@/lib/language";
import { Languages } from "lucide-react";
import { useInShell } from "@/components/pageFrame";

/** The three-way language switch. The choice is changed on this device at once and kept in this browser; when the person is signed in it is also saved
 *  on their account (LanguageAccountSync), so it follows them to any device. The screens that can show a note say where it is kept: `showNote`. */
export function LanguageToggle({ dark = false, showNote = false }: { dark?: boolean; showNote?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const { signedIn, save } = useAccountLanguage();
  const note = signedIn
    ? pickLanguage(language, {
      ar: "تُحفظ اللغة في حسابك، فتتبعك إلى أي جهاز.",
      en: "The language is saved to your account, so it follows you to any device.",
      ur: "زبان آپ کے اکاؤنٹ میں محفوظ ہوتی ہے، اور آپ کے ہر آلے پر آپ کے ساتھ جاتی ہے۔",
    })
    : pickLanguage(language, {
      ar: "تُحفظ اللغة على هذا الجهاز. سجّل الدخول لتتبعك في أي جهاز.",
      en: "The language is saved on this device. Sign in to keep it on your account.",
      ur: "زبان اس آلے پر محفوظ ہوتی ہے۔ اپنے اکاؤنٹ میں رکھنے کے لیے سائن ان کریں۔",
    });
  const groupLabel = pickLanguage(language, { ar: "لغة الواجهة", en: "Interface language", ur: "انٹرفیس کی زبان" });
  // inside the product frame the frame's own language menu is the one switch: a page must not draw a second (code review of #156, item 2)
  if (useInShell()) return null;
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
              onClick={() => { setLanguage(code); save(code); }}
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
