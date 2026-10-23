import { EnterpriseNavigation } from "@/components/EnterpriseNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Clock3, FileWarning, ShieldCheck, Target, TimerReset } from "lucide-react";
import React, { useState } from "react";
import { useParams } from "wouter";
import { enumLabel } from "@/lib/labels";

const number = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value}`;
// A server refusal (no active linked employee record) does not change on retry: show the server's reason at once instead of after three retries.
const isRefusal = (error: unknown) => (error as { data?: { code?: string } } | null)?.data?.code === "FORBIDDEN";

export default function MyPerformance() {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic } = useLanguage();
  const [statement, setStatement] = useState("");
  const query = trpc.performance.get.useQuery({ tenantId, projectId }, { retry: (failureCount, error) => !isRefusal(error) && failureCount < 3 });
  const objection = trpc.performance.objections.create.useMutation({ onSuccess: () => { setStatement(""); query.refetch(); } });
  const t = isArabic ? {
    title: "مؤشراتي", subtitle: "قراءة محسوبة من سجلات التشغيل الفعلية، وليست تقييمًا آليًا أو قرارًا تأديبيًا.", generated: "وقت الحساب", assigned: "المسند إلي", completed: "المنجز", overdue: "المتأخر", onTime: "الإنجاز في الموعد", response: "متوسط زمن الاستجابة", open: "البنود المفتوحة", hours: "ساعة", formula: "المعادلة ومصادر البيانات", sources: "مصادر التشغيل المستخدمة", exclusions: "الاستبعادات الموثقة", objections: "اعتراضاتي", objectionHint: "إن رأيت أن الرقم لا يعكس ظرفًا تشغيليًا، اشرح اعتراضك. لا ينشئ هذا المسار أي أثر تأديبي أو تعاقدي تلقائي.", submit: "إرسال الاعتراض", loading: "يتم حساب مؤشراتك من مصادر التشغيل…", empty: "لا توجد سجلات تشغيلية محسوبة ضمن نطاقك الحالي.", records: "سجلات محتسبة", excluded: "مستبعد بسبب موثق", status: "الحالة", source: "المصدر", notApplicable: "غير منطبق", error: "تعذر تحميل مؤشراتك الآن." } : {
    title: "My indicators", subtitle: "Calculated from operating records. This is not an automated assessment or a disciplinary decision.", generated: "Calculated at", assigned: "Assigned", completed: "Completed", overdue: "Overdue", onTime: "On-time completion", response: "Average response", open: "Open now", hours: "hours", formula: "Formula & data sources", sources: "Operating sources used", exclusions: "Documented exclusions", objections: "My objections", objectionHint: "If the number does not reflect an operating circumstance, explain your objection. This route creates no automatic disciplinary or contractual effect.", submit: "Submit objection", loading: "Calculating your indicators from operating sources…", empty: "No operating records are currently calculated in your scope.", records: "Records considered", excluded: "Excluded with a documented reason", status: "Status", source: "Source", notApplicable: "Not applicable", error: "Your indicators could not be loaded right now." };
  const metrics = query.data?.metrics;
  const cards = metrics ? [
    [t.assigned, metrics.assignedCount, Target], [t.completed, metrics.completedCount, ShieldCheck], [t.overdue, metrics.overdueCount, FileWarning], [t.onTime, metrics.onTimeCompletionPercent === null ? t.notApplicable : `${metrics.onTimeCompletionPercent}%`, Clock3], [t.response, metrics.averageResponseHours === null ? t.notApplicable : `${metrics.averageResponseHours} ${t.hours}`, TimerReset], [t.open, metrics.openCount, AlertCircle],
  ] as const : [];
  return <main className="min-h-screen bg-background text-foreground"><EnterpriseNavigation tenantId={tenantId} projectId={projectId} context="project" /><div className="container py-7 space-y-6" dir={isArabic ? "rtl" : "ltr"}>
    <section className="rounded-3xl bg-[var(--dashio-indigo)] text-white p-6 md:p-8 shadow-xl"><p className="text-xs font-semibold tracking-[0.18em] uppercase text-white/90">PROJECT OS · {query.data?.employee.employeeNumber ?? "—"}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{t.title}</h1><p className="mt-2 max-w-3xl text-white/80">{t.subtitle}</p>{metrics && <p className="mt-4 text-sm text-white/70">{t.generated}: {metrics.generatedAt.toLocaleString(isArabic ? "ar-SA" : "en-GB")}</p>}</section>
    {query.isLoading && <Card><CardContent className="py-8 text-sm text-muted-foreground">{t.loading}</CardContent></Card>}
    {query.error && <Card className="border-destructive"><CardContent className="py-6 text-sm text-destructive">{getLocalizedProjectError(query.error, isArabic) || t.error}</CardContent></Card>}
    {metrics && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-[var(--dashio-aqua)]" /></CardContent></Card>)}</section>
    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><Card><CardHeader><CardTitle>{t.formula}</CardTitle><CardDescription>{metrics.formula}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex gap-2 flex-wrap"><Badge variant="secondary">{t.records}: {metrics.recordsConsidered}</Badge><Badge variant="outline">{t.excluded}: {metrics.excludedCount}</Badge></div><div className="grid gap-2 sm:grid-cols-2">{Object.entries(metrics.sourceCounts).map(([source, count]) => <div key={source} className="rounded-xl border px-3 py-2 text-sm flex justify-between"><span>{source.replaceAll("_", " ")}</span><strong>{count}</strong></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>{t.objections}</CardTitle><CardDescription>{t.objectionHint}</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea value={statement} onChange={event => setStatement(event.target.value)} placeholder={t.objectionHint} aria-label={t.objections} /><Button disabled={statement.trim().length < 20 || objection.isPending} onClick={() => objection.mutate({ tenantId, projectId, statement })}>{t.submit}</Button>{objection.error && <p className="text-sm text-destructive">{getLocalizedProjectError(objection.error, isArabic)}</p>}{(query.data?.objections ?? []).map(item => <div key={item.id} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-2"><Badge variant="outline">{enumLabel(item.status, isArabic)}</Badge><span className="text-xs text-muted-foreground">{item.createdAt.toLocaleDateString(isArabic ? "ar-SA" : "en-GB")}</span></div><p className="mt-2">{item.statement}</p>{item.resolutionNote && <p className="mt-2 text-muted-foreground">{item.resolutionNote}</p>}</div>)}</CardContent></Card></section>
    <Card><CardHeader><CardTitle>{t.sources}</CardTitle><CardDescription>{t.empty}</CardDescription></CardHeader><CardContent className="space-y-2">{metrics.sources.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : metrics.sources.map(source => <div key={`${source.sourceType}:${source.sourceId}`} className="rounded-xl border p-3 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{source.label}</p><p className="text-xs text-muted-foreground">{enumLabel(source.sourceType, isArabic)} · {t.status}: {enumLabel(source.status, isArabic)}</p></div><Badge variant="secondary">{source.completedAt ? t.completed : t.open}</Badge></div>)}</CardContent></Card></>}
  </div></main>;
}
