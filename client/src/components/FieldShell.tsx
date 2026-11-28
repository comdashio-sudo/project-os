import { CheckedForm } from "@/components/CheckedForm";
import { formatShortDate } from "@/components/ds/format";
import React from "react";
import { PageMain } from "@/components/pageFrame";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { UnitJump } from "@/components/UnitJump";
import type { PageKey } from "@shared/pageAccess";

/** Every control a thumb has to hit is at least 44 px (the phone screens of the field work). */
export const tap = "min-h-[44px] min-w-[44px]";
export const fieldInput = `${tap} w-full rounded-xl border bg-card px-3 text-base`;

const tabsText = {
  ar: { nav: "شاشات الميدان", entry: "الإدخال الميداني", siteUpdate: "تحديث إنجاز الموقع", progress: "تحديث الإنجاز", qc: "استلام QC", report: "التقرير اليومي", submittals: "تسليمات الاستشاري", quality: "الجودة", unit: "بطاقة وحدة", unitNumber: "رقم الوحدة", open: "فتح" },
  en: { nav: "Field screens", entry: "Field entry", siteUpdate: "Update site progress", progress: "Progress update", qc: "QC receipt", report: "Daily report", submittals: "Consultant submittals", quality: "Quality", unit: "Unit card", unitNumber: "Unit number", open: "Open" },
  ur: { nav: "سائٹ کی اسکرینیں", entry: "فیلڈ اندراج", siteUpdate: "سائٹ کی پیش رفت اپ ڈیٹ کریں", progress: "پیش رفت کی تازہ کاری", qc: "کیو سی وصولی", report: "روزانہ رپورٹ", submittals: "کنسلٹنٹ سبمٹلز", quality: "معیار", unit: "یونٹ کارڈ", unitNumber: "یونٹ نمبر", open: "کھولیں" },
};

/** The ways between the field screens, and a unit number that opens the unit's card. */
function FieldTabs({ tenantId, projectId, current }: { tenantId: string; projectId: string; current?: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, tabsText);
  const [, navigate] = useLocation();
  const [unit, setUnit] = React.useState("");
  const base = `/m/${tenantId}/${projectId}`;
  const tabs = [["entry", base, t.entry], ["progress", `${base}/progress`, t.progress], ["qc", `${base}/qc`, t.qc], ["report", `${base}/report`, t.report], ["submittals", `/projects/${tenantId}/${projectId}/submittals`, t.submittals], ["quality", `/projects/${tenantId}/${projectId}/quality`, t.quality]] as const;
  // Q-70 (5) (I72, adviser 28-11): one progress screen — «تحديث الإنجاز»; the old site-workbook screen is reached from the comparison, not from this bar
  // Q-33: a tab is drawn only when its page's server reads would answer (shared/pageAccess.ts); the submittals tab is not in the table yet.
  // Q-36 (step 5): the field entry and the site update are field screens too, and the daily report has its gate now (#410)
  const can = { entry: useCanPage("fieldEntry", projectId), siteUpdate: useCanPage("siteUpdate", projectId), progress: useCanPage("progress", projectId), qc: useCanPage("qc", projectId), report: useCanPage("dailyReport", projectId), quality: useCanPage("quality", projectId) } as Record<string, boolean>;
  return (
    <nav aria-label={t.nav} className="flex flex-wrap items-center gap-2">
      {tabs.filter(([key]) => can[key] !== false).map(([key, href, label]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined} className={`${tap} inline-flex items-center rounded-xl px-3 text-sm font-semibold ${current === key ? "bg-primary text-primary-foreground" : "border bg-card text-foreground"}`}>{label}</Link>)}
      {/* Q-67 (5): the villas are read with the progress screen's own gate (project.pmc.read); without them the typed number stays */}
      <UnitJump tenantId={tenantId} projectId={projectId} canRead={can.progress !== false} placeholder={t.unit} fallback={
      <CheckedForm className="flex flex-wrap items-center gap-1" onSubmit={event => { event.preventDefault(); if (unit.trim()) navigate(`${base}/unit/${encodeURIComponent(unit.trim())}`); }}>
        <input aria-label={t.unitNumber} placeholder={t.unitNumber} inputMode="numeric" required className={`${tap} w-28 rounded-xl border bg-card px-3 text-sm`} value={unit} onChange={event => setUnit(event.target.value)} />
        <button type="submit" className={`${tap} rounded-xl border bg-card px-3 text-sm font-semibold`}>{t.unit}</button>
      </CheckedForm>
      } />
    </nav>
  );
}

/** Q-33: the way back is drawn only when it leads somewhere the person can open (the field entry and the controls page need project.read). */
const pageOfHref = (href: string): PageKey | null => (/^\/m\/[^/]+\/[^/]+$/.test(href) ? "fieldEntry" : /^\/projects\/[^/]+\/[^/]+\/controls$/.test(href) ? "controls" : null);
function BackLink({ href, label, projectId, className = "text-primary" }: { href: string; label: string; projectId?: string; className?: string }) {
  const page = pageOfHref(href);
  const allowed = useCanPage(page ?? "registry", projectId);
  if (page && !allowed) return null;
  return <Link href={href} className={`${tap} inline-flex items-center text-sm font-semibold ${className}`}>{label}</Link>;
}

/** The frame the field screens share: the language switch, a way back, the title, the ways between the field screens. Right to left for Arabic and Urdu, left to right for English. */
export function FieldShell({ title, backHref, backLabel, wide, tenantId, projectId, current, header, children }: { title: string; backHref: string; backLabel: string; wide?: boolean; tenantId?: string; projectId?: string; current?: string; header?: React.ReactNode; children: React.ReactNode }) {
  const { isRtl, language } = useLanguage();
  // the Urdu face (Nastaliq) needs far more room between lines than the tight default: without it the label of one field sits on the value of the one above
  return (
    <PageMain className={`min-h-screen bg-background px-4 py-4 text-foreground ${language === "ur" ? "[&_*]:!leading-[2.1]" : ""}`} dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-2 flex justify-end"><LanguageToggle /></div>
      <div className={`mx-auto space-y-4 ${wide ? "max-w-5xl" : "max-w-md"}`}>
        {/* Q-19 (4): the dark band of the reference's phone screens (way back, title, and what a screen adds, such as its steps) */}
        <div data-field-header className="rounded-[18px] bg-hero px-4 pb-4 pt-1 text-hero-foreground">
          <BackLink href={backHref} label={backLabel} projectId={projectId} className="text-hero-foreground/75 hover:text-hero-foreground" />
          <h1 className="text-2xl font-bold">{title}</h1>
          {header}
        </div>
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
  return formatShortDate(date, language);
}
