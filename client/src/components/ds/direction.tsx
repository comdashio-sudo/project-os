import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

// A design direction is a set of tokens (client/src/design/directions.css) chosen by data-direction on the document. Setting it on <html> as well as on the wrapper is deliberate:
// menus, dialogs and toasts are drawn by their libraries into <body>, outside the wrapper, and must still find their colours.
export type DirectionId = "a" | "b" | "c";
export type Mode = "light" | "dark";
export const DIRECTIONS: Record<DirectionId, { id: DirectionId; name: { ar: string; en: string; ur: string }; darkMode: boolean }> = {
  a: { id: "a", name: { ar: "النيلي الدقيق", en: "Indigo Precision", ur: "انڈیگو پریسژن" }, darkMode: true },
  b: { id: "b", name: { ar: "الدفتر الدافئ", en: "Warm Ledger", ur: "گرم کھاتا" }, darkMode: false },
  c: { id: "c", name: { ar: "المخطط الأحادي", en: "Blueprint Mono", ur: "بلیو پرنٹ مونو" }, darkMode: true },
};

type DirectionValue = { direction: DirectionId; mode: Mode };
const DirectionContext = createContext<DirectionValue>({ direction: "a", mode: "light" });
export const useDirection = () => useContext(DirectionContext);

export function DirectionProvider({ direction, mode = "light", className, children }: { direction: DirectionId; mode?: Mode; className?: string; children: React.ReactNode }) {
  const { language, isRtl } = useLanguage();
  const effective: Mode = DIRECTIONS[direction].darkMode ? mode : "light";
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-direction", direction); root.setAttribute("data-mode", effective); root.setAttribute("data-lang", language);
    root.classList.toggle("dark", effective === "dark");
    return () => { root.removeAttribute("data-direction"); root.removeAttribute("data-mode"); root.removeAttribute("data-lang"); root.classList.remove("dark"); };
  }, [direction, effective, language]);
  const value = useMemo(() => ({ direction, mode: effective }), [direction, effective]);
  return <DirectionContext.Provider value={value}><div data-direction={direction} data-mode={effective} data-lang={language} dir={isRtl ? "rtl" : "ltr"} lang={language} className={`${effective === "dark" ? "dark " : ""}${className ?? ""}`}>{children}</div></DirectionContext.Provider>;
}
