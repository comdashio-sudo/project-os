import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMoney } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { WriteGate } from "@/lib/permissions";

const text = {
  ar: {
    title: "تكلفة العمالة المحمّلة", factor: "معامل التحميل الفعلي", none: "لم تُسعَّر ساعات من الرواتب بعد", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    priced: (loaded: number, resource: number, hours: number) => `${loaded} إدخال وقت مسعّر من الرواتب، و${resource} من سعر خطة المورد (لا هيكل راتب)، بإجمالي ${hours} ساعة.`,
    settings: "إعدادات الشركة", gosi: "تأمين صاحب العمل — سعودي (٪)", gosiNon: "تأمين صاحب العمل — غير سعودي (٪)", eosYears: "سنوات النسبة الأولى", eosFirst: "أشهر عن كل سنة في المدة الأولى", eosLater: "أشهر عن كل سنة بعدها", estimateNote: "تقدير للتكلفة، وليس احتسابًا قانونيًا. التأمين على (الأساسي + السكن)، ونهاية الخدمة على الأجر والبدلات الثابتة بمدة الخدمة.", indirect: "تحميل غير مباشر (٪)", hours: "ساعات اليوم", days: "أيام العمل", edit: "تعديل", save: "حفظ", cancel: "إلغاء", saved: "حُفظت الإعدادات",
    defaults: "إعدادات افتراضية: تأمين 11.75٪ لسعودي و2٪ لغيره، نهاية خدمة نصف شهر عن كل سنة من الخمس الأولى وشهر بعدها، من الأحد إلى الخميس، ثماني ساعات.", loadedCost: "التكلفة المحمّلة المعتمدة", note: "المعامل = التكلفة المحمّلة ÷ الأجر والبدلات وحدهما لنفس الساعات. لا تظهر أجور الأفراد.",
    dayNames: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  },
  en: {
    title: "Loaded labour cost", factor: "Effective loading factor", none: "No hours have been priced from payroll yet", loading: "Loading…", retry: "Retry",
    priced: (loaded: number, resource: number, hours: number) => `${loaded} time entries priced from payroll and ${resource} from the resource plan rate (no salary structure), ${hours} hours in all.`,
    settings: "Tenant settings", gosi: "Employer insurance — Saudi (%)", gosiNon: "Employer insurance — non-Saudi (%)", eosYears: "Years at the first rate", eosFirst: "Months per year in that period", eosLater: "Months per year after it", estimateNote: "A cost estimate, not a legal calculation. Insurance is on (basic + housing); end of service is on pay and fixed allowances by length of service.", indirect: "Indirect loading (%)", hours: "Hours per day", days: "Working days", edit: "Edit", save: "Save", cancel: "Cancel", saved: "Settings saved",
    defaults: "Default settings: insurance 11.75% for a Saudi and 2% for anyone else, end of service half a month a year for the first five years then a month, Sunday to Thursday, eight hours.", loadedCost: "Approved loaded cost", note: "The factor is the loaded cost over pay and allowances alone for the same hours. No individual's pay is shown.",
    dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
};

export default function LabourLoadingCard({ tenantId, projectId, currency }: { tenantId: string; projectId: string; currency: string }) {
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const labour = trpc.profitability.labour.useQuery({ tenantId, projectId });
  const settings = trpc.labourSettings.get.useQuery({ tenantId });
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ gosi: "11.75", gosiNon: "2", indirect: "0", hours: "8", eosYears: "5", eosFirst: "0.5", eosLater: "1", days: [0, 1, 2, 3, 4] as number[] });
  const save = trpc.labourSettings.save.useMutation({ onSuccess: () => { setEditing(false); setMessage(t.saved); labour.refetch(); settings.refetch(); } });

  if (labour.isLoading || settings.isLoading) return <p role="status" className="text-sm text-slate-500">{t.loading}</p>;
  if (!labour.data || !settings.data) return <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(labour.error ?? settings.error, isArabic)}</p><Button variant="outline" className="mt-2 min-h-[44px]" onClick={() => { labour.refetch(); settings.refetch(); }}>{t.retry}</Button></div>;
  const data = labour.data;
  const s = settings.data;
  const dayList = s.workingDays.map(day => t.dayNames[day]).join(isArabic ? "، " : ", ");
  const open = () => { setForm({ gosi: String(Math.round(s.employerGosiRateSaudi * 10000) / 100), gosiNon: String(Math.round(s.employerGosiRateNonSaudi * 10000) / 100), indirect: String(s.indirectLoadingPercent), hours: String(s.hoursPerDay), eosYears: String(s.eosFirstPeriodYears), eosFirst: String(s.eosFirstPeriodMonthsPerYear), eosLater: String(s.eosLaterMonthsPerYear), days: [...s.workingDays] }); setMessage(null); setEditing(true); };
  const toggleDay = (day: number) => setForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day].sort((a, b) => a - b) }));
  const submit = () => save.mutate({ tenantId, employerGosiRateSaudi: Number(form.gosi) / 100, employerGosiRateNonSaudi: Number(form.gosiNon) / 100, indirectLoadingPercent: Number(form.indirect), hoursPerDay: Number(form.hours), workingDays: form.days, eosFirstPeriodYears: Number(form.eosYears), eosFirstPeriodMonthsPerYear: Number(form.eosFirst), eosLaterMonthsPerYear: Number(form.eosLater) });

  return (
    <section aria-label={t.title} className="mt-6 rounded-xl border p-4" data-testid="labour-card">
      <h3 className="text-base font-semibold">{t.title}</h3>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p><span className="text-sm text-slate-500">{t.factor}: </span><b data-testid="labour-factor">{data.effectiveLoadingFactor === null ? "—" : `×${data.effectiveLoadingFactor.toFixed(2)}`}</b></p>
        <p><span className="text-sm text-slate-500">{t.loadedCost}: </span><b>{formatMoney(data.loadedCost, currency, isArabic)}</b></p>
      </div>
      <p className="mt-1 text-sm text-slate-600">{data.approvedEntries === 0 ? t.none : t.priced(data.loadedEntries, data.resourceEntries, data.hours)}</p>
      <p className="mt-2 text-sm" data-testid="labour-settings">{t.settings}: {t.gosi} {Math.round(s.employerGosiRateSaudi * 10000) / 100}% · {t.gosiNon} {Math.round(s.employerGosiRateNonSaudi * 10000) / 100}% · {t.eosFirst} {s.eosFirstPeriodMonthsPerYear} ({s.eosFirstPeriodYears}) · {t.eosLater} {s.eosLaterMonthsPerYear} · {t.indirect} {s.indirectLoadingPercent}% · {t.hours} {s.hoursPerDay} · {t.days}: {dayList}{s.isDefault ? ` — ${t.defaults}` : ""}</p>
      <p className="mt-1 text-xs text-slate-500">{t.note}</p>
      <p className="mt-1 text-xs font-medium text-amber-800" data-testid="labour-estimate-note">{t.estimateNote}</p>
      {message && <p role="status" className="mt-2 text-sm text-emerald-700">{message}</p>}
      {s.canEdit && !editing && <Button variant="outline" className="mt-3 min-h-[44px]" onClick={open}>{t.edit}</Button>}
      {editing && (
        <WriteGate permission={"project.settings.labour"} reason={{ ar: "لا تملك صلاحية ضبط تحميل تكلفة العمالة، فالشاشة للعرض فقط.", en: "You do not have permission to configure labour cost loading; this view is read-only for you." }}><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); submit(); }}>
          <label className="text-sm">{t.gosi}<input aria-label={t.gosi} type="number" step="0.01" min="0" max="50" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.gosi} onChange={event => setForm(f => ({ ...f, gosi: event.target.value }))} /></label>
          <label className="text-sm">{t.gosiNon}<input aria-label={t.gosiNon} type="number" step="0.01" min="0" max="50" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.gosiNon} onChange={event => setForm(f => ({ ...f, gosiNon: event.target.value }))} /></label>
          <label className="text-sm">{t.eosYears}<input aria-label={t.eosYears} type="number" step="1" min="0" max="50" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.eosYears} onChange={event => setForm(f => ({ ...f, eosYears: event.target.value }))} /></label>
          <label className="text-sm">{t.eosFirst}<input aria-label={t.eosFirst} type="number" step="0.05" min="0" max="3" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.eosFirst} onChange={event => setForm(f => ({ ...f, eosFirst: event.target.value }))} /></label>
          <label className="text-sm">{t.eosLater}<input aria-label={t.eosLater} type="number" step="0.05" min="0" max="3" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.eosLater} onChange={event => setForm(f => ({ ...f, eosLater: event.target.value }))} /></label>
          <label className="text-sm">{t.indirect}<input aria-label={t.indirect} type="number" step="0.1" min="0" max="300" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.indirect} onChange={event => setForm(f => ({ ...f, indirect: event.target.value }))} /></label>
          <label className="text-sm">{t.hours}<input aria-label={t.hours} type="number" step="0.5" min="1" max="24" className="mt-1 block min-h-[44px] w-full rounded-lg border px-2" value={form.hours} onChange={event => setForm(f => ({ ...f, hours: event.target.value }))} /></label>
          <fieldset className="text-sm"><legend>{t.days}</legend><div className="mt-1 flex flex-wrap gap-2">{t.dayNames.map((name, day) => <label key={day} className="flex min-h-[44px] items-center gap-1 rounded-lg border px-2"><input type="checkbox" aria-label={name} checked={form.days.includes(day)} onChange={() => toggleDay(day)} />{name}</label>)}</div></fieldset>
          {save.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(save.error, isArabic)}</p>}
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" className="min-h-[44px]" disabled={save.isPending || form.days.length === 0}>{t.save}</Button><Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setEditing(false)}>{t.cancel}</Button></div>
        </form></WriteGate>
      )}
    </section>
  );
}
