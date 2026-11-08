import React from "react";
import { PageMain } from "@/components/pageFrame";
import { Link, useLocation } from "wouter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

/** Every control a thumb has to hit is at least 44 px (the phone screens of the field work). */
export const tap = "min-h-[44px] min-w-[44px]";
export const fieldInput = `${tap} w-full rounded-xl border bg-white px-3 text-base`;

const tabsText = {
  ar: { nav: "شاشات الميدان", report: "التقرير اليومي", submittals: "تسليمات الاستشاري", quality: "الجودة", unit: "بطاقة وحدة", unitNumber: "رقم الوحدة", open: "فتح" },
  en: { nav: "Field screens", report: "Daily report", submittals: "Consultant submittals", quality: "Quality", unit: "Unit card", unitNumber: "Unit number", open: "Open" },
  ur: { nav: "سائٹ کی اسکرینیں", report: "روزانہ رپورٹ", submittals: "کنسلٹنٹ سبمٹلز", quality: "معیار", unit: "یونٹ کارڈ", unitNumber: "یونٹ نمبر", open: "کھولیں" },
};

/** The ways between the field screens, and a unit number that opens the unit's card. */
function FieldTabs({ tenantId, projectId, current }: { tenantId: string; projectId: string; current?: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, tabsText);
  const [, navigate] = useLocation();
  const [unit, setUnit] = React.useState("");
  const base = `/m/${tenantId}/${projectId}`;
  const tabs = [["report", `${base}/report`, t.report], ["submittals", `/projects/${tenantId}/${projectId}/submittals`, t.submittals], ["quality", `/projects/${tenantId}/${projectId}/quality`, t.quality]] as const;
  return (
    <nav aria-label={t.nav} className="flex flex-wrap items-center gap-2">
      {tabs.map(([key, href, label]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined} className={`${tap} inline-flex items-center rounded-xl px-3 text-sm font-semibold ${current === key ? "bg-[#0e6b70] text-white" : "border bg-white text-slate-800"}`}>{label}</Link>)}
      <form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); if (unit.trim()) navigate(`${base}/unit/${encodeURIComponent(unit.trim())}`); }}>
        <input aria-label={t.unitNumber} placeholder={t.unitNumber} inputMode="numeric" className={`${tap} w-28 rounded-xl border bg-white px-3 text-sm`} value={unit} onChange={event => setUnit(event.target.value)} />
        <button type="submit" className={`${tap} rounded-xl border bg-white px-3 text-sm font-semibold`}>{t.unit}</button>
      </form>
    </nav>
  );
}

/** The frame the field screens share: the language switch, a way back, the title, the ways between the field screens. Right to left for Arabic and Urdu, left to right for English. */
export function FieldShell({ title, backHref, backLabel, wide, tenantId, projectId, current, children }: { title: string; backHref: string; backLabel: string; wide?: boolean; tenantId?: string; projectId?: string; current?: string; children: React.ReactNode }) {
  const { isRtl, language } = useLanguage();
  // the Urdu face (Nastaliq) needs far more room between lines than the tight default: without it the label of one field sits on the value of the one above
  return (
    <PageMain className={`min-h-screen bg-[#f7f8fc] px-4 py-4 text-slate-900 ${language === "ur" ? "[&_*]:!leading-[2.1]" : ""}`} dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-2 flex justify-end"><LanguageToggle /></div>
      <div className={`mx-auto space-y-4 ${wide ? "max-w-5xl" : "max-w-md"}`}>
        <Link href={backHref} className={`${tap} inline-flex items-center text-sm font-semibold text-[#0e6b70]`}>{backLabel}</Link>
        <h1 className="text-xl font-semibold">{title}</h1>
        {tenantId && projectId && <FieldTabs tenantId={tenantId} projectId={projectId} current={current} />}
        {children}
      </div>
    </PageMain>
  );
}

/** "2026-10-24" → the date as the person's language writes it, with Western digits (owner decision: numbers stay 0–9). */
export function showDate(value: string | Date | null | undefined, language: "ar" | "en" | "ur"): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : language === "ur" ? "ur-PK-u-nu-latn" : "en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(date);
}
