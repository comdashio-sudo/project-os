import React, { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { GUIDE_CADENCES, guideStepHref, userGuide, type GuideCadence, type GuideSectionId } from "@/lib/userGuide";
import { getOperationalRoleName } from "@/lib/operationalRolePresentation";
import { permissionLabel } from "@/lib/labels";
import { pickLanguage } from "@/lib/language";

const sectionFromHash = (): GuideSectionId => {
  const wanted = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return userGuide.find(section => section.id === wanted)?.id ?? userGuide[0]!.id;
};

/** The user guide inside the platform (item 12): pick the role, follow its daily and weekly steps, open the screen from each step. */
export default function UserGuide() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, language, isRtl } = useLanguage();
  const [active, setActive] = useState<GuideSectionId>(sectionFromHash);
  const section = userGuide.find(item => item.id === active)!;
  const pick = (id: GuideSectionId) => { setActive(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* the address bar is a convenience */ } };
  const lang = isArabic ? "ar" : "en";
  const t = pickLanguage(language, { ar: { back: "العودة إلى ضوابط المشروع", title: "دليل الاستخدام", sub: "اختر دورك لترى خطواته اليومية والأسبوعية على الشاشات الفعلية. الصور من بيانات تجريبية.", roles: "أدوار الدليل", cannot: "ما لا يخصّك", needs: "الصلاحية المطلوبة", open: "افتح الشاشة", step: "الخطوة", of: "من", daily: "كل يوم", weekly: "كل أسبوع" }, en: { back: "Back to project controls", title: "User guide", sub: "Pick your role to see its daily and weekly steps on the real screens. Pictures use synthetic data.", roles: "Guide roles", cannot: "What is not yours", needs: "Permission needed", open: "Open the screen", step: "Step", of: "of", daily: "Every day", weekly: "Every week" }, ur: { back: "Back to project controls", title: "User guide", sub: "Pick your role to see its daily and weekly steps on the real screens. Pictures use synthetic data.", roles: "Guide roles", cannot: "What is not yours", needs: "Permission needed", open: "Open the screen", step: "Step", of: "of", daily: "Every day", weekly: "Every week" } });
  // Steps are shown by cadence (daily first), numbered in the order the reader meets them.
  const ordered = GUIDE_CADENCES.flatMap((cadence: GuideCadence) => section.steps.flatMap((step, index) => (step.cadence === cadence ? [{ step, index }] : [])));
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900" dir={isRtl ? "rtl" : "ltr"}>
      <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link><LanguageToggle /></div></header>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-slate-600">{t.sub}</p>
        <nav aria-label={t.roles} className="mt-5"><ul className="flex flex-wrap gap-2">
          {userGuide.map(item => <li key={item.id}><button type="button" aria-current={item.id === active ? "true" : undefined} onClick={() => pick(item.id)} className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold ${item.id === active ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "border-slate-300 bg-white text-slate-700"}`}>{item.title[lang]}</button></li>)}
        </ul></nav>
        <section aria-labelledby="guide-section-title" className="mt-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 id="guide-section-title" className="text-2xl font-semibold">{section.title[lang]}</h2>
          <p className="mt-1 text-xs font-semibold text-[#0e6b70]">{getOperationalRoleName({ code: section.roleCode, name: section.roleCode }, isArabic)}</p>
          <p className="mt-3 leading-7">{section.intro[lang]}</p>
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900"><strong>{t.cannot}:</strong> {section.cannot[lang]}</p>
          {GUIDE_CADENCES.map(cadence => {
            const items = ordered.filter(item => item.step.cadence === cadence);
            if (!items.length) return null;
            return (
              <div key={cadence} className="mt-8" data-cadence={cadence}>
                <h4 className="border-b border-slate-200 pb-2 text-sm font-semibold text-[#0e6b70]">{t[cadence]}</h4>
                <ol className="mt-6 space-y-8">
                  {items.map(({ step, index }) => (
                    <li key={`${section.id}-${index}`} id={`${section.id}-${index + 1}`} className="scroll-mt-5">
                      <h3 className="text-lg font-semibold"><span className="text-[#0e6b70]">{t.step} {ordered.findIndex(item => item.index === index && item.step === step) + 1} {t.of} {ordered.length} — </span>{step.title[lang]}</h3>
                      <p className="mt-2 leading-7 text-slate-700">{step.body[lang]}</p>
                      <p className="mt-1 text-xs text-slate-500">{t.needs}: {permissionLabel(step.needs, step.needs, language)}</p>
                      {step.image ? <figure className="mt-3"><img src={step.image} alt={`${step.title[lang]}`} loading="lazy" width={1100} height={620} className="w-full rounded-xl border border-slate-200 bg-slate-50" /></figure> : null}
                      <Link href={guideStepHref(step.screen, tenantId, projectId)} className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-[#0e6b70] px-4 text-sm font-semibold text-[#0e6b70]">{t.open}</Link>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
