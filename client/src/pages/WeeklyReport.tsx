import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, TableScroll, TextArea, TextInput, formatDate, formatNumber, formatPercent } from "@/components/ds";
import { PageMain } from "@/components/pageFrame";
import { SectionFailed } from "@/components/ScreenStates";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { suggestWeeklyTexts, type WeekFigures } from "@/lib/weeklySuggest";
import { weeklyReportNumber, type DeckFigures } from "@/lib/weeklyDeck";
import { WeeklyExports } from "@/components/WeeklyDeckSlides";

// D-49 (b): the weekly report editor. Its FIGURES are the period engine's (reportPeriods.get, D-48) and are shown as text — there is no field for a number; its
// WORDS (eleven texts) and the chosen daily-report photos are saved by reportPeriods.saveWeekly (D-49 a). «Suggest from the figures» fills only an empty text.
const TEXTS = ["summary", "analysis", "correctiveActions", "milestones", "outlook", "engineering", "procurement", "commercial", "interfaces", "issues", "decisions"] as const;
type TextKey = (typeof TEXTS)[number];
const MAX_PHOTOS = 24;
const text = {
  ar: {
    title: "التقرير الأسبوعي", back: "ضوابط المشروع", week: "بداية الأسبوع", previous: "الأسبوع السابق", next: "الأسبوع التالي", figures: "أرقام الأسبوع (من اليوميات المعتمدة، لا تُحرَّر)",
    reports: "تقارير يومية معدودة", workingDays: "أيام العمل", missing: "أيام بلا تقرير", labour: "العمالة (رجل×يوم)", direct: "مباشرة", indirect: "غير مباشرة", ncrOpen: "NCR مفتوحة", incidents: "حوادث",
    activity: "النشاط", planned: "المخطط", actual: "الفعلي", variance: "الانحراف", ofPlan: "من المخطط", completed: "وحدات اكتملت", noActivities: "لا أسطر عمل في يوميات هذا الأسبوع.",
    words: "نصوص التقرير", suggest: "اقترح من الأرقام", suggested: "مُلئت النصوص الفارغة من الأرقام؛ عدّلها كما تشاء.", photos: "صور الأسبوع", chosen: (n: number) => `${formatNumber(n)} من ${MAX_PHOTOS} مختارة`, noPhotos: "لا صور في يوميات هذا الأسبوع.",
    noProfile: "تعذّر تحميل بيانات المشروع؛ يُصدَّر التقرير بلا شعارات ولا بادئة ترقيم.", save: "احفظ التقرير", saving: "جارٍ الحفظ…", saved: "حُفظ التقرير الأسبوعي.", readOnly: "للعرض فقط: لا تملك صلاحية كتابة التقرير.",
    labels: { summary: "الملخص", analysis: "التحليل", correctiveActions: "الإجراءات التصحيحية", milestones: "المعالم", outlook: "النظرة للأسبوعين القادمين", engineering: "الهندسة", procurement: "المشتريات", commercial: "التجاري", interfaces: "الواجهات", issues: "المشكلات", decisions: "القرارات المطلوبة" } as Record<TextKey, string>,
  },
  en: {
    title: "Weekly report", back: "Project controls", week: "Week starting", previous: "Previous week", next: "Next week", figures: "The week's figures (from approved daily reports, not editable)",
    reports: "Daily reports counted", workingDays: "Working days", missing: "Days without a report", labour: "Labour (man-days)", direct: "Direct", indirect: "Indirect", ncrOpen: "Open NCRs", incidents: "Incidents",
    activity: "Activity", planned: "Planned", actual: "Actual", variance: "Variance", ofPlan: "Of plan", completed: "Units completed", noActivities: "No work lines in this week's daily reports.",
    words: "Report texts", suggest: "Suggest from the figures", suggested: "Empty texts were filled from the figures; edit them as you wish.", photos: "The week's photos", chosen: (n: number) => `${formatNumber(n)} of ${MAX_PHOTOS} chosen`, noPhotos: "No photos in this week's daily reports.",
    noProfile: "The project profile could not be loaded; the report is exported without logos or number prefix.", save: "Save the report", saving: "Saving…", saved: "The weekly report was saved.", readOnly: "View only: you cannot write the report.",
    labels: { summary: "Summary", analysis: "Analysis", correctiveActions: "Corrective actions", milestones: "Milestones", outlook: "Outlook for the next two weeks", engineering: "Engineering", procurement: "Procurement", commercial: "Commercial", interfaces: "Interfaces", issues: "Issues", decisions: "Decisions required" } as Record<TextKey, string>,
  },
  ur: {
    title: "ہفتہ وار رپورٹ", back: "پروجیکٹ کنٹرولز", week: "ہفتے کا آغاز", previous: "پچھلا ہفتہ", next: "اگلا ہفتہ", figures: "ہفتے کے اعداد (منظور شدہ روزانہ رپورٹوں سے، قابلِ ترمیم نہیں)",
    reports: "شمار شدہ روزانہ رپورٹیں", workingDays: "کام کے دن", missing: "رپورٹ کے بغیر دن", labour: "مزدوری (آدمی-دن)", direct: "براہِ راست", indirect: "بالواسطہ", ncrOpen: "کھلی NCR", incidents: "حادثات",
    activity: "سرگرمی", planned: "منصوبہ", actual: "اصل", variance: "فرق", ofPlan: "منصوبے کا", completed: "مکمل یونٹس", noActivities: "اس ہفتے کی روزانہ رپورٹوں میں کام کی کوئی سطر نہیں۔",
    words: "رپورٹ کی تحریریں", suggest: "اعداد سے تجویز کریں", suggested: "خالی تحریریں اعداد سے بھری گئیں؛ جیسے چاہیں ترمیم کریں۔", photos: "ہفتے کی تصاویر", chosen: (n: number) => `${MAX_PHOTOS} میں سے ${formatNumber(n)} منتخب`, noPhotos: "اس ہفتے کی روزانہ رپورٹوں میں کوئی تصویر نہیں۔",
    noProfile: "پروجیکٹ کی معلومات لوڈ نہیں ہو سکیں؛ رپورٹ لوگو اور نمبر کے سابقے کے بغیر برآمد ہوگی۔", save: "رپورٹ محفوظ کریں", saving: "محفوظ ہو رہا ہے…", saved: "ہفتہ وار رپورٹ محفوظ ہو گئی۔", readOnly: "صرف دیکھنے کے لیے: آپ رپورٹ نہیں لکھ سکتے۔",
    labels: { summary: "خلاصہ", analysis: "تجزیہ", correctiveActions: "اصلاحی اقدامات", milestones: "سنگِ میل", outlook: "اگلے دو ہفتوں کا منظر", engineering: "انجینئرنگ", procurement: "خریداری", commercial: "تجارتی", interfaces: "انٹرفیسز", issues: "مسائل", decisions: "مطلوبہ فیصلے" } as Record<TextKey, string>,
  },
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
/** The week that holds today, starting on Saturday (the site's working week). */
export function currentWeekStart(today = new Date()) { const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())); day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 1) % 7)); return iso(day); }
const shift = (weekStart: string, days: number) => { const day = new Date(`${weekStart}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return iso(day); };
const figure = (value: number | null | undefined, decimals = 0) => (value === null || value === undefined ? "—" : formatNumber(value, decimals));

export default function WeeklyReport() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const canWrite = useCan(["project.field.manage", "project.manage"], projectId);
  const figures = trpc.reportPeriods.get.useQuery({ ...scope, kind: "week", anchor: weekStart }, { enabled: Boolean(tenantId && projectId && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) });
  const saved = trpc.reportPeriods.weekly.useQuery({ ...scope, weekStart }, { enabled: Boolean(tenantId && projectId && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) });
  const profile = trpc.projects.profile.get.useQuery(scope, { enabled: Boolean(tenantId && projectId) });
  const utils = trpc.useUtils();
  const save = trpc.reportPeriods.saveWeekly.useMutation({ onSuccess: () => { setNotice(t.saved); void utils.reportPeriods.weekly.invalidate({ ...scope, weekStart }); } });
  const [texts, setTexts] = useState<Record<TextKey, string>>(() => Object.fromEntries(TEXTS.map(key => [key, ""])) as Record<TextKey, string>);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // what was saved for the week fills the editor when the week opens (or changes)
  useEffect(() => {
    const report = saved.data?.report;
    setTexts(Object.fromEntries(TEXTS.map(key => [key, report?.[key] ?? ""])) as Record<TextKey, string>);
    setPhotoIds(saved.data?.photos.map(photo => photo.id) ?? []);
  }, [saved.data]);
  useEffect(() => { setNotice(null); save.reset(); }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = useMemo(() => { const seen = new Set<string>(); return [...(saved.data?.photos ?? []), ...(saved.data?.candidates ?? [])].filter(photo => (seen.has(photo.id) ? false : (seen.add(photo.id), true))); }, [saved.data]);
  const toggle = (id: string) => setPhotoIds(current => (current.includes(id) ? current.filter(item => item !== id) : current.length >= MAX_PHOTOS ? current : [...current, id]));
  const suggest = () => {
    if (!figures.data) return;
    const proposal = suggestWeeklyTexts(figures.data as unknown as WeekFigures, language);
    setTexts(current => ({ ...current, ...Object.fromEntries(Object.entries(proposal).filter(([key]) => !current[key as TextKey].trim())) }));
    setNotice(t.suggested);
  };
  const data = figures.data;
  return (
    <PageMain className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex min-h-11 items-center text-sm text-primary">{t.back}</Link><h1 className="text-xl font-semibold">{t.title}</h1></div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" onClick={() => setWeekStart(shift(weekStart, -7))}>{t.previous}</Button>
          <Field label={t.week}>{props => <TextInput {...props} type="date" value={weekStart} onChange={event => setWeekStart(event.target.value)} />}</Field>
          <Button variant="secondary" onClick={() => setWeekStart(shift(weekStart, 7))}>{t.next}</Button>
        </div>
      </div>
      {figures.error ? <SectionFailed title={t.figures} error={figures.error} isArabic={language === "ar"} onRetry={() => figures.refetch()} /> : data ? (
        <Card aria-label={t.figures} data-week-figures>
          <CardHeader><CardTitle>{t.figures}</CardTitle><p className="text-sm text-muted-foreground"><bdi dir="ltr">{formatDate(data.period.start, language)} – {formatDate(data.period.end, language)}</bdi></p></CardHeader>
          <CardBody className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-6">{([[t.reports, data.reports.length], [t.workingDays, data.period.workingDayCount], [t.missing, data.missingWorkingDays.length], [`${t.labour} · ${t.direct}`, data.labour.period.direct], [`${t.labour} · ${t.indirect}`, data.labour.period.indirect], [t.ncrOpen, data.quality.ncr.open]] as const).map(([label, value]) => (
              <div key={label} className="rounded-[var(--radius)] bg-muted p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{formatNumber(value)}</dd></div>))}</dl>
            {data.activities.length === 0 ? <p className="text-sm text-muted-foreground">{t.noActivities}</p> : (
              <TableScroll label={t.figures}>
                <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr>{[t.activity, t.planned, t.actual, t.variance, t.ofPlan, t.completed].map(head => <th key={head} scope="col" className="p-2 text-start">{head}</th>)}</tr></thead>
                  <tbody className="divide-y">{data.activities.map(activity => (
                    <tr key={activity.activityId}><th scope="row" className="p-2 text-start font-normal"><bdi>{activity.code}</bdi> · {activity.name}</th><td className="p-2">{figure(activity.period.planned, 2)}</td><td className="p-2">{figure(activity.period.actual, 2)}</td>
                      <td className="p-2">{figure(activity.period.variance, 2)}</td><td className="p-2">{activity.period.percentOfPlan === null ? "—" : formatPercent(activity.period.percentOfPlan, 1)}</td><td className="p-2">{formatNumber(activity.period.completedUnits)}</td></tr>
                  ))}</tbody></table>
              </TableScroll>
            )}
          </CardBody>
        </Card>
      ) : null}
      {saved.error ? <SectionFailed title={t.words} error={saved.error} isArabic={language === "ar"} onRetry={() => saved.refetch()} /> : (
        <Card aria-label={t.words}>
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{t.words}</CardTitle>{canWrite ? <Button variant="secondary" disabled={!data} onClick={suggest}>{t.suggest}</Button> : null}</div>{canWrite ? null : <p role="note" className="text-sm text-muted-foreground">{t.readOnly}</p>}</CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            {TEXTS.map(key => <Field key={key} label={t.labels[key]}>{props => <TextArea {...props} dir="auto" maxLength={8000} readOnly={!canWrite} value={texts[key]} onChange={event => setTexts(current => ({ ...current, [key]: event.target.value }))} />}</Field>)}
          </CardBody>
        </Card>
      )}
      <Card aria-label={t.photos}>
        <CardHeader><CardTitle>{t.photos}</CardTitle><p className="text-sm text-muted-foreground" aria-live="polite">{t.chosen(photoIds.length)}</p></CardHeader>
        <CardBody>{photos.length === 0 ? <p className="text-sm text-muted-foreground">{t.noPhotos}</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map(photo => (
            <li key={photo.id}><label className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-[var(--radius)] border p-2 text-xs has-[:checked]:border-primary">
              {photo.url ? <img src={photo.url} alt={photo.caption ?? photo.fileName} className="aspect-video w-full rounded object-cover" /> : null}
              <span className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={photoIds.includes(photo.id)} disabled={!canWrite || (!photoIds.includes(photo.id) && photoIds.length >= MAX_PHOTOS)} onChange={() => toggle(photo.id)} />
                <span>{formatDate(photo.reportDate, language)}{photo.caption ? ` · ${photo.caption}` : ""}</span></span>
            </label></li>))}</ul>
        )}</CardBody>
      </Card>
      {profile.error ? <p role="note" className="text-sm text-muted-foreground">{t.noProfile}</p> : null}
      <WeeklyExports fileBase={`weekly-report-${weekStart}`} deck={data && (profile.data !== undefined || profile.error) ? {
        number: weeklyReportNumber(profile.data?.reportPrefix ?? null, data.period.start), figures: data as unknown as DeckFigures, labels: t.labels, texts,
        photos: photos.filter(photo => photoIds.includes(photo.id)).map(photo => ({ url: photo.url, caption: photo.caption })),
        logos: [profile.data?.logos.client?.url ?? null, profile.data?.logos.consultant?.url ?? null, profile.data?.logos.contractor?.url ?? null],
        parties: [profile.data?.clientName ?? null, profile.data?.consultantName ?? null, profile.data?.contractorName ?? null],
      } : null} />
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={save.isPending} onClick={() => { setNotice(null); save.mutate({ ...scope, weekStart, texts, photoIds }); }}>{save.isPending ? t.saving : t.save}</Button>
          {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
          {save.error ? <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(save.error, language)}</p> : null}
        </div>
      ) : null}
    </PageMain>
  );
}
