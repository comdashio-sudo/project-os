import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { SourceNotice } from "@/components/SectionResilience";
import { EmptyState } from "@/components/ScreenStates";
import { useLanguage } from "@/contexts/LanguageContext";
import { NewCompanyCard } from "@/components/NewCompanyCard";
import { enumLabel } from "@/lib/labels";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { Building2, KeyRound, Layers3, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

// The platform owner's entry: every company with its licence, and the plan catalogue. Only the account with the platform-administrator role (users.role = 'admin') sees it;
// the server refuses anyone else (assertPlatformAdministrator), and the screen sends no request for them at all.
const text: Record<"ar" | "en" | "ur", Record<string, string>> = {
  ar: { title: "إدارة المنصة", note: "للمالك فقط: الشركات والخطط والتراخيص في مكان واحد.", companies: "الشركات", plans: "الخطط", licenses: "التراخيص", back: "الرئيسية", none: "لا توجد شركات بعد.", noPlans: "لا توجد خطة في الكتالوج.", plan: "الخطة", status: "الحالة", seats: "المقاعد", noLicense: "بلا ترخيص", openLicense: "التراخيص", openCompany: "فتح الشركة", active: "فعّالة", inactive: "موقوفة", package: "الباقة", forbidden: "هذه الصفحة لمالك المنصة فقط.", total: "إجمالي الشركات", shown: "المعروض", truncated: "القائمة مقتطعة: المعروض أحدث", of: "من", planNote: "الميزات والحدود تُضبط لكل شركة من «التراخيص» الخاصة بها.", planList: "نظرة المنصة", loading: "جارٍ التحميل…", designPreview: "معاينة التصميم" },
  en: { title: "Platform administration", note: "For the platform owner only: companies, plans and licences in one place.", companies: "Companies", plans: "Plans", licenses: "Licences", back: "Home", none: "No companies yet.", noPlans: "The catalogue has no plan.", plan: "Plan", status: "Status", seats: "Seats", noLicense: "No licence", openLicense: "Licences", openCompany: "Open company", active: "Active", inactive: "Switched off", package: "Package", forbidden: "This page is for the platform owner only.", total: "Companies in all", shown: "Shown", truncated: "The list is cut: showing the newest", of: "of", planNote: "Features and limits are set per company from its own Licences page.", planList: "The platform overview", loading: "Loading…", designPreview: "Design preview" },
  ur: { title: "پلیٹ فارم کا انتظام", note: "صرف پلیٹ فارم کے مالک کے لیے: کمپنیاں، پلانز اور لائسنس ایک جگہ۔", companies: "کمپنیاں", plans: "پلانز", licenses: "لائسنس", back: "ہوم", none: "ابھی کوئی کمپنی نہیں۔", noPlans: "کیٹلاگ میں کوئی پلان نہیں۔", plan: "پلان", status: "حالت", seats: "نشستیں", noLicense: "لائسنس نہیں", openLicense: "لائسنس", openCompany: "کمپنی کھولیں", active: "فعال", inactive: "بند", package: "پیکج", forbidden: "یہ صفحہ صرف پلیٹ فارم کے مالک کے لیے ہے۔", total: "کل کمپنیاں", shown: "دکھائی گئیں", truncated: "فہرست کٹی ہوئی ہے: تازہ ترین دکھائی گئی ہیں", of: "میں سے", planNote: "فیچرز اور حدیں ہر کمپنی کے اپنے لائسنس صفحے سے طے ہوتی ہیں۔", planList: "پلیٹ فارم کا جائزہ", loading: "لوڈ ہو رہا ہے…", designPreview: "ڈیزائن کا پیش منظر" },
};

export default function PlatformAdmin() {
  const { user, loading } = useAuth(); const { isArabic, language, isRtl } = useLanguage(); const t = pickLanguage(language, text);
  const platformOwner = user?.role === "admin";
  const overview = trpc.platform.overview.useQuery(undefined, { enabled: platformOwner });
  if (loading) return <main className="min-h-screen bg-slate-50 p-8"><p role="status">{t.loading}</p></main>;
  if (!platformOwner) return <main dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-xl"><EmptyState isArabic={isArabic} title={t.forbidden} body={t.note} /><Link href="/" className="mt-4 inline-block font-semibold text-primary">{t.back}</Link></div></main>;
  const data = overview.data;
  return <main dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />{t.title}</p><h1 className="mt-1 text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-slate-600">{t.note}</p></div><div className="flex flex-wrap gap-4"><Link href="/design-preview" className="font-semibold text-primary">{t.designPreview}</Link><Link href="/" className="font-semibold text-primary">{t.back}</Link></div></div>
    <SourceNotice query={overview} isArabic={isArabic} title={t.planList} />
    {overview.isLoading ? <p role="status" className="text-slate-600">{t.loading}</p> : null}
    {data ? <>
      <NewCompanyCard onCreated={() => void overview.refetch()} />
      <section aria-label={t.companies} className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="h-5 w-5 text-primary" />{t.companies} <span className="text-sm font-normal text-slate-500">({t.total}: {data.totalCompanies})</span></h2>
        {data.truncated ? <p role="status" className="mt-2 text-sm text-amber-800">{t.truncated} {data.shownCompanies} {t.of} {data.totalCompanies}</p> : null}
        {data.companies.length === 0 ? <p className="mt-3 text-slate-600">{t.none}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start text-slate-500"><th className="p-2 text-start">{t.companies}</th><th className="p-2 text-start">{t.plan}</th><th className="p-2 text-start">{t.status}</th><th className="p-2 text-start">{t.seats}</th><th className="p-2" /></tr></thead><tbody>
          {data.companies.map(company => <tr key={company.id} className="border-t"><td className="p-2"><p className="font-semibold">{company.legalName}</p><p dir="ltr" className="text-xs text-slate-500">{company.slug}</p></td><td className="p-2">{company.license ? company.license.planName : t.noLicense}</td><td className="p-2">{enumLabel(company.license ? company.license.status : company.status, language)}</td><td className="p-2">{company.license?.seats ?? "—"}</td>
            <td className="p-2"><div className="flex flex-wrap gap-2"><Link href={`/licensing/${company.id}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-3 font-semibold text-primary"><KeyRound className="h-4 w-4" />{t.openLicense}</Link><Link href={`/projects/${company.id}`} className="inline-flex min-h-[44px] items-center rounded-lg border px-3 font-semibold">{t.openCompany}</Link></div></td></tr>)}
        </tbody></table></div>}
      </section>
      <section aria-label={t.plans} className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="h-5 w-5 text-primary" />{t.plans} <span className="text-sm font-normal text-slate-500">({data.plans.length})</span></h2>
        <p className="mt-1 text-sm text-slate-600">{t.planNote}</p>
        {data.plans.length === 0 ? <p className="mt-3 text-slate-600">{t.noPlans}</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.plans.map(plan => <li key={plan.code} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{plan.name}</p><p dir="ltr" className="text-xs text-slate-500">{plan.code} · {t.package}: {plan.packageCode}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{plan.active ? t.active : t.inactive}</span></li>)}</ul>}
      </section>
    </> : null}
  </div></main>;
}
