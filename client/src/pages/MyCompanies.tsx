import { FieldError } from "@/components/FieldError";
import { SourceNotice } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { formFieldErrors, slugFieldError } from "@/lib/formValidation";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { putToStorage } from "@/lib/uploadLimit";
import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";

// Q-12 part 1 — «My companies»: every company the person belongs to, a way into each (the same switch as the top bar), a new company of their own
// (self-service sign-up: the server checks the verified email, the plan and the daily limit), and the details of the open company for its managers.
// Who may edit is decided by the server (tenant.profile answers only tenant.manage); the form is simply absent for everyone else.
const T = {
  ar: {  logo: "الشعار", logoHint: "PNG أو JPEG أو SVG، حتى 2 ميجابايت. يُحفظ مع «حفظ».", logoNone: "لا شعار", logoRemove: "إزالة الشعار", logoPending: "شعار جديد جاهز للحفظ", logoUploading: "جارٍ الرفع…", title: "شركاتي", intro: "الشركات التي أنت عضو فيها. افتح أيًّا منها، أو أنشئ شركة جديدة.", open: "افتح", current: "الشركة الحالية", invited: "دعوة لم تُقبل", suspended: "موقوفة", revoked: "مُلغاة", none: "لست عضوًا في أي شركة بعد.", details: "بيانات الشركة الحالية", legal: "الاسم القانوني", locale: "لغة الشركة", save: "حفظ", saving: "جارٍ الحفظ…", saved: "حُفظت بيانات الشركة.", slug: "المعرّف", newTitle: "شركة جديدة", newSlug: "المعرّف (أحرف إنجليزية صغيرة وأرقام وشرطات)", plan: "الخطة", pick: "اختر خطة", seats: "عدد المقاعد", create: "إنشاء الشركة", creating: "جارٍ الإنشاء…" },
  en: {  logo: "Logo", logoHint: "PNG, JPEG or SVG, up to 2 MB. Stored when you press Save.", logoNone: "No logo", logoRemove: "Remove the logo", logoPending: "New logo ready to save", logoUploading: "Uploading…", title: "My companies", intro: "The companies you belong to. Open any of them, or create a new company.", open: "Open", current: "Current company", invited: "Invitation not accepted", suspended: "Suspended", revoked: "Revoked", none: "You are not a member of any company yet.", details: "Details of the current company", legal: "Legal name", locale: "Company language", save: "Save", saving: "Saving…", saved: "The company details were saved.", slug: "Identifier", newTitle: "New company", newSlug: "Identifier (lowercase letters, digits, dashes)", plan: "Plan", pick: "Choose a plan", seats: "Seats", create: "Create the company", creating: "Creating…" },
  ur: {  logo: "لوگو", logoHint: "PNG، JPEG یا SVG، 2 MB تک۔ «محفوظ کریں» پر محفوظ ہوگا۔", logoNone: "کوئی لوگو نہیں", logoRemove: "لوگو ہٹائیں", logoPending: "نیا لوگو محفوظ کرنے کے لیے تیار", logoUploading: "اپ لوڈ ہو رہا ہے…", title: "میری کمپنیاں", intro: "وہ کمپنیاں جن کے آپ رکن ہیں۔ کوئی بھی کھولیں، یا نئی کمپنی بنائیں۔", open: "کھولیں", current: "موجودہ کمپنی", invited: "دعوت قبول نہیں ہوئی", suspended: "معطل", revoked: "منسوخ", none: "آپ ابھی کسی کمپنی کے رکن نہیں ہیں۔", details: "موجودہ کمپنی کی تفصیلات", legal: "قانونی نام", locale: "کمپنی کی زبان", save: "محفوظ کریں", saving: "محفوظ ہو رہا ہے…", saved: "کمپنی کی تفصیلات محفوظ ہو گئیں۔", slug: "شناخت", newTitle: "نئی کمپنی", newSlug: "شناخت (چھوٹے انگریزی حروف، ہندسے، ڈیش)", plan: "پلان", pick: "پلان منتخب کریں", seats: "نشستیں", create: "کمپنی بنائیں", creating: "بن رہی ہے…" },
};
const LOCALES = [{ value: "ar", label: "العربية" }, { value: "en", label: "English" }] as const;

export default function MyCompanies() {
  const { language } = useLanguage();
  const t = pickLanguage(language, T);
  const isArabic = language === "ar";
  const { tenantId = "" } = useParams<{ tenantId?: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const tenants = trpc.tenant.mine.useQuery();
  const status = (value: string) => (value === "invited" ? t.invited : value === "suspended" ? t.suspended : value === "revoked" ? t.revoked : null);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      <SourceNotice query={tenants} isArabic={isArabic} title={t.title} className="mt-3" />
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border" aria-label={t.title}>
        {(tenants.data ?? []).map(item => (
          <li key={item.tenantId} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="font-medium">{item.legalName}</p><p dir="ltr" className="text-xs text-muted-foreground">{item.slug}</p>
              {item.tenantId === tenantId && <p className="text-xs text-emerald-800">{t.current}</p>}{status(item.status) && <p className="text-xs text-amber-800">{status(item.status)}</p>}</div>
            {item.status === "active" && <Link href={`/projects/${item.tenantId}`} className="inline-flex min-h-[44px] items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent">{t.open}</Link>}
          </li>
        ))}
        {tenants.isSuccess && !tenants.data.length && <li className="p-3 text-sm text-muted-foreground">{t.none}</li>}
      </ul>
      {tenantId && <CompanyDetails tenantId={tenantId} t={t} isArabic={isArabic} onSaved={() => void utils.tenant.mine.invalidate()} />}
      <NewCompany t={t} isArabic={isArabic} onCreated={async id => { await utils.tenant.mine.invalidate(); setLocation(`/setup/${id}`); }} />
    </main>
  );
}

function CompanyDetails({ tenantId, t, isArabic, onSaved }: { tenantId: string; t: (typeof T)["ar"]; isArabic: boolean; onSaved: () => void }) {
  const profile = trpc.tenant.profile.useQuery({ tenantId }, { retry: false });
  const [legalName, setLegalName] = useState(""); const [defaultLocale, setDefaultLocale] = useState<"ar" | "en">("ar");
  useEffect(() => { if (profile.data) { setLegalName(profile.data.legalName); setDefaultLocale(profile.data.defaultLocale); } }, [profile.data]);
  // logo: undefined = keep, null = remove, { uploadKey } = the file already PUT to Storage, taken by the server on «Save»
  const [logo, setLogo] = useState<{ uploadKey: string } | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const logoUpload = trpc.tenant.createLogoUpload.useMutation();
  const save = trpc.tenant.updateProfile.useMutation({ onSuccess: () => { setLogo(undefined); onSaved(); void profile.refetch(); } });
  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { const target = await logoUpload.mutateAsync({ tenantId, fileName: file.name, contentType: file.type || "application/octet-stream" }); await putToStorage(target.uploadUrl, target.headers, file, () => undefined); setLogo({ uploadKey: target.uploadKey }); }
    catch { /* the refusal is shown from logoUpload.error */ } finally { setUploading(false); }
  };
  // a refusal (not a manager of this company) means no form: the server would refuse the write anyway. Any other failure says so (G-100).
  if (profile.error) return profile.error.data?.code === "FORBIDDEN" ? null : <SourceNotice query={profile} isArabic={isArabic} title={t.details} className="mt-6" />;
  if (!profile.data) return null;
  return (
    <section className="mt-6 rounded-xl border border-border p-4" aria-labelledby="company-details-title">
      <h2 id="company-details-title" className="text-lg font-semibold">{t.details}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t.slug}: <span dir="ltr">{profile.data.slug}</span></p>
      <form noValidate className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); save.mutate({ tenantId, legalName, defaultLocale, ...(logo === undefined ? {} : { logo }) }); }}>
        <div><Label htmlFor="company-legal">{t.legal}</Label><Input id="company-legal" className="mt-2 min-h-[44px]" value={legalName} onChange={event => setLegalName(event.target.value)} required minLength={2} maxLength={255} /></div>
        <div><Label htmlFor="company-locale">{t.locale}</Label><Select id="company-locale" className="mt-2 md:min-h-11" options={[...LOCALES]} value={defaultLocale} onValueChange={value => setDefaultLocale(value as "ar" | "en")} /></div>
        <div className="sm:col-span-2"><Label htmlFor="company-logo">{t.logo}</Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {logo === undefined && profile.data.logo?.url ? <img src={profile.data.logo.url} alt={t.logo} className="h-16 w-auto max-w-40 rounded-md border border-border bg-white object-contain p-1" /> : <span className="text-sm text-muted-foreground">{logo ? t.logoPending : t.logoNone}</span>}
            <Input id="company-logo" type="file" accept="image/png,image/jpeg,image/svg+xml" aria-describedby="company-logo-hint" className="min-h-[44px] max-w-xs" disabled={uploading} onChange={event => void pickLogo(event.target.files?.[0])} />
            {(profile.data.logo || logo) && logo !== null && <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setLogo(null)}>{t.logoRemove}</Button>}
          </div>
          <p id="company-logo-hint" className="mt-1 text-xs text-muted-foreground">{uploading ? t.logoUploading : t.logoHint}</p>
          {logoUpload.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(logoUpload.error, isArabic)}</p>}
        </div>
        {save.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(save.error, isArabic)}</p>}
        {save.isSuccess && <p role="status" className="text-sm text-emerald-800 sm:col-span-2">{t.saved}</p>}
        <div className="sm:col-span-2"><Button className="min-h-[44px]" disabled={save.isPending || uploading || legalName.trim().length < 2}>{save.isPending ? t.saving : t.save}</Button></div>
      </form>
    </section>
  );
}

function NewCompany({ t, isArabic, onCreated }: { t: (typeof T)["ar"]; isArabic: boolean; onCreated: (tenantId: string) => void }) {
  const { language } = useLanguage();
  const plans = trpc.selfService.plans.useQuery();
  const [legalName, setLegalName] = useState(""); const [slug, setSlug] = useState(""); const [planCode, setPlanCode] = useState(""); const [seats, setSeats] = useState("5");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const signup = trpc.selfService.signup.useMutation({ onSuccess: result => onCreated(result.tenantId) });
  return (
    <section className="mt-6 rounded-xl border border-border p-4" aria-labelledby="new-company-title">
      <h2 id="new-company-title" className="text-lg font-semibold">{t.newTitle}</h2>
      <SourceNotice query={plans} isArabic={isArabic} title={t.plan} className="mt-3" />
      <form noValidate className="mt-3 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const errors = formFieldErrors(event.currentTarget, language); const slugProblem = slugFieldError(slug, language); if (slugProblem) errors["new-slug"] = slugProblem; setFieldErrors(errors); if (Object.keys(errors).length === 0) signup.mutate({ legalName, slug, planCode, seats: Number(seats) }); }}>
        <div><Label htmlFor="new-legal">{t.legal}</Label><Input id="new-legal" className="mt-2 min-h-[44px]" value={legalName} onChange={event => setLegalName(event.target.value)} required minLength={2} /><FieldError id="new-legal-error" message={fieldErrors["new-legal"]} /></div>
        <div><Label htmlFor="new-slug">{t.newSlug}</Label><Input id="new-slug" dir="ltr" className="mt-2 min-h-[44px]" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} required /><FieldError id="new-slug-error" message={fieldErrors["new-slug"] ?? (slug !== "" ? slugFieldError(slug, language) : null)} /></div>
        <div><Label htmlFor="new-plan">{t.plan}</Label><Select id="new-plan" className="mt-2 md:min-h-11" aria-required placeholder={t.pick} options={(plans.data ?? []).map(plan => ({ value: plan.code, label: `${plan.name} · ${plan.packageCode}` }))} value={planCode || undefined} onValueChange={setPlanCode} /><FieldError id="new-plan-error" message={fieldErrors["new-plan"]} /></div>
        <div><Label htmlFor="new-seats">{t.seats}</Label><Input id="new-seats" type="number" min={1} max={100000} className="mt-2 min-h-[44px]" value={seats} onChange={event => setSeats(event.target.value)} required /><FieldError id="new-seats-error" message={fieldErrors["new-seats"]} /></div>
        {signup.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(signup.error, isArabic)}</p>}
        <div className="sm:col-span-2"><Button className="min-h-[44px]" disabled={signup.isPending || !planCode}>{signup.isPending ? t.creating : t.create}</Button></div>
      </form>
    </section>
  );
}
