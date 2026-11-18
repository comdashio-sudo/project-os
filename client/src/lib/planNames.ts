// The name of a commercial plan in the interface language (G-213 / O-20, Q-47). The catalogue keeps one English name per plan
// (`commercial_plans.name`, from server/domain/commercialCatalog.ts); the interface maps it by the plan's code, so a renamed or new plan
// still shows the name stored for it until it is added here. Translation is direct and keeps the package visible:
// "All-In-One Standard" becomes «الشاملة — القياسية».
import type { Language } from "./language";

const PLAN_NAMES: Record<string, { ar: string; ur: string }> = {
  EXECUTIVE_STANDARD: { ar: "التنفيذية — القياسية", ur: "ایگزیکٹو — معیاری" },
  PMO_STANDARD: { ar: "مكتب إدارة المشاريع — القياسية", ur: "پروجیکٹ مینجمنٹ آفس — معیاری" },
  PROJECT_STANDARD: { ar: "المشروع — القياسية", ur: "پروجیکٹ — معیاری" },
  EXECUTIVE_PMO_STANDARD: { ar: "التنفيذية + مكتب إدارة المشاريع — القياسية", ur: "ایگزیکٹو + پروجیکٹ مینجمنٹ آفس — معیاری" },
  PMO_PROJECT_STANDARD: { ar: "مكتب إدارة المشاريع + المشروع — القياسية", ur: "پروجیکٹ مینجمنٹ آفس + پروجیکٹ — معیاری" },
  EXECUTIVE_PROJECT_STANDARD: { ar: "التنفيذية + المشروع — القياسية", ur: "ایگزیکٹو + پروجیکٹ — معیاری" },
  ALL_IN_ONE_STANDARD: { ar: "الشاملة — القياسية", ur: "جامع — معیاری" },
};

/** The plan's name for the reader: the translation for its code in Arabic or Urdu, otherwise the name the catalogue stores. */
export function planLabel(plan: { code?: string | null; name: string }, language: Language): string {
  if (language === "en" || !plan.code) return plan.name;
  return PLAN_NAMES[plan.code]?.[language] ?? plan.name;
}

/** The plan codes that have a translation (the test checks it covers the shipped catalogue). */
export const TRANSLATED_PLAN_CODES = Object.keys(PLAN_NAMES);
