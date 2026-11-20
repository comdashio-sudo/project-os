// Q-28 (P-118): the project's safety page — the indicators (LTIFR, TRIR, the man-hours they rest on, and the incidents by kind), the permits to work with
// their state (active, expired, not started, closed, cancelled), and the incident register. Recording an incident, investigating and closing it, issuing a
// permit and closing it are shown only to whoever holds project.hse.manage on the project. Every figure is the server's (safety.register, computed in
// shared/safetyIndicators.ts); every rule is the server's (server/safety.ts).
import React, { useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, MetricCard, Segmented, Select, TextInput, type BadgeTone } from "@/components/ds";
import { formatAmount, formatDate, formatDateTime } from "@/components/ds/format";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { PAGE_NAMES } from "@shared/pageNames";
import { SAFETY_INCIDENT_KINDS, type SafetyIncidentKind } from "@shared/safetyIndicators";

const WRITERS = ["project.hse.manage"] as const;
const PERMIT_TYPES = ["hot_work", "work_at_height", "confined_space", "excavation", "electrical", "lifting", "other"] as const;
type PermitType = (typeof PERMIT_TYPES)[number];
type PermitState = "active" | "expired" | "not_started" | "closed" | "cancelled";
const STATE_TONE: Record<PermitState, BadgeTone> = { active: "success", expired: "danger", not_started: "info", closed: "neutral", cancelled: "neutral" };

const text = {
  ar: {
    intro: "سجل السلامة في المشروع: الحوادث وشبه الحوادث، وتصاريح العمل الخطر، ومؤشرا LTIFR وTRIR من ساعات العمل في التقارير اليومية المعتمدة.",
    views: "العرض", indicators: "المؤشرات", incidents: "الحوادث", permits: "تصاريح العمل",
    ltifr: "LTIFR", ltifrHow: "الإصابات المضيّعة للوقت × 1,000,000 ÷ ساعات العمل", trir: "TRIR", trirHow: "الحالات المسجَّلة × 200,000 ÷ ساعات العمل",
    manHours: "ساعات العمل", manHoursHow: (n: number) => `من ${n} تقرير يومي معتمد`, noHours: "لا ساعات عمل بعد", daysWithoutHours: (n: number) => `${n} تقرير فيه عمالة بلا ساعات عمل (لم يُحسب)`,
    lostTime: "إصابات مضيّعة للوقت", recordable: "حالات مسجَّلة", byKind: "الحوادث حسب النوع",
    kinds: { near_miss: "شبه حادث", first_aid: "إسعاف أولي", medical_treatment: "علاج طبي", restricted_work: "عمل مقيّد", lost_time: "إصابة مضيّعة للوقت", fatality: "وفاة", property_damage: "ضرر ممتلكات", environmental: "حادث بيئي" } as Record<SafetyIncidentKind, string>,
    statuses: { open: "مفتوح", investigating: "قيد التحقيق", closed: "مغلق" } as Record<string, string>,
    permitTypes: { hot_work: "أعمال ساخنة", work_at_height: "عمل على ارتفاع", confined_space: "أماكن مغلقة", excavation: "حفر", electrical: "أعمال كهربائية", lifting: "رفع", other: "أخرى" } as Record<PermitType, string>,
    states: { active: "فعّال", expired: "منتهٍ", not_started: "لم يبدأ", closed: "مغلق", cancelled: "ملغى" } as Record<PermitState, string>,
    noIncidents: "لا حوادث مسجّلة.", noPermits: "لا تصاريح عمل.", record: "تسجيل حادث", issue: "إصدار تصريح", save: "حفظ", cancel: "إلغاء", saved: "حُفظ.",
    number: "الرقم", date: "التاريخ", kind: "النوع", title: "العنوان", description: "الوصف", location: "الموقع", people: "عدد المتأثرين", lostDays: "أيام العمل الضائعة",
    rootCause: "السبب الجذري", correctiveAction: "الإجراء التصحيحي", investigate: "بدء التحقيق", closeIncident: "إغلاق الحادث",
    permitType: "نوع العمل", responsible: "الجهة المسؤولة", validFrom: "يبدأ", validTo: "ينتهي", closePermit: "إغلاق التصريح", cancelPermit: "إلغاء التصريح", note: "ملاحظة",
    window: (from: string, to: string) => `${from} ← ${to}`, reportedBy: "سجّله",
  },
  en: {
    intro: "The project's safety register: incidents and near misses, permits to work for hazardous work, and LTIFR and TRIR from the man-hours of the approved daily reports.",
    views: "View", indicators: "Indicators", incidents: "Incidents", permits: "Permits to work",
    ltifr: "LTIFR", ltifrHow: "Lost-time injuries × 1,000,000 ÷ man-hours", trir: "TRIR", trirHow: "Recordable incidents × 200,000 ÷ man-hours",
    manHours: "Man-hours", manHoursHow: (n: number) => `From ${n} approved daily reports`, noHours: "No man-hours yet", daysWithoutHours: (n: number) => `${n} reports have workers but no working hours (not counted)`,
    lostTime: "Lost-time injuries", recordable: "Recordable incidents", byKind: "Incidents by kind",
    kinds: { near_miss: "Near miss", first_aid: "First aid", medical_treatment: "Medical treatment", restricted_work: "Restricted work", lost_time: "Lost-time injury", fatality: "Fatality", property_damage: "Property damage", environmental: "Environmental" } as Record<SafetyIncidentKind, string>,
    statuses: { open: "Open", investigating: "Investigating", closed: "Closed" } as Record<string, string>,
    permitTypes: { hot_work: "Hot work", work_at_height: "Work at height", confined_space: "Confined space", excavation: "Excavation", electrical: "Electrical work", lifting: "Lifting", other: "Other" } as Record<PermitType, string>,
    states: { active: "Active", expired: "Expired", not_started: "Not started", closed: "Closed", cancelled: "Cancelled" } as Record<PermitState, string>,
    noIncidents: "No incidents recorded.", noPermits: "No permits to work.", record: "Record an incident", issue: "Issue a permit", save: "Save", cancel: "Cancel", saved: "Saved.",
    number: "Number", date: "Date", kind: "Kind", title: "Title", description: "Description", location: "Location", people: "People involved", lostDays: "Lost workdays",
    rootCause: "Root cause", correctiveAction: "Corrective action", investigate: "Start investigation", closeIncident: "Close the incident",
    permitType: "Type of work", responsible: "Responsible party", validFrom: "Starts", validTo: "Ends", closePermit: "Close the permit", cancelPermit: "Cancel the permit", note: "Note",
    window: (from: string, to: string) => `${from} → ${to}`, reportedBy: "Recorded by",
  },
  ur: {
    intro: "پروجیکٹ کا حفاظتی رجسٹر: واقعات اور قریب الوقوع واقعات، خطرناک کام کے اجازت نامے، اور منظور شدہ روزانہ رپورٹس کے کام کے گھنٹوں سے LTIFR اور TRIR۔",
    views: "منظر", indicators: "اشاریے", incidents: "واقعات", permits: "کام کے اجازت نامے",
    ltifr: "LTIFR", ltifrHow: "وقت ضائع کرنے والی چوٹیں × 1,000,000 ÷ کام کے گھنٹے", trir: "TRIR", trirHow: "قابلِ اندراج واقعات × 200,000 ÷ کام کے گھنٹے",
    manHours: "کام کے گھنٹے", manHoursHow: (n: number) => `${n} منظور شدہ روزانہ رپورٹس سے`, noHours: "ابھی کام کے گھنٹے نہیں", daysWithoutHours: (n: number) => `${n} رپورٹس میں کارکن ہیں مگر کام کے گھنٹے نہیں (شمار نہیں)`,
    lostTime: "وقت ضائع کرنے والی چوٹیں", recordable: "قابلِ اندراج واقعات", byKind: "قسم کے لحاظ سے واقعات",
    kinds: { near_miss: "قریب الوقوع واقعہ", first_aid: "ابتدائی طبی امداد", medical_treatment: "طبی علاج", restricted_work: "محدود کام", lost_time: "وقت ضائع کرنے والی چوٹ", fatality: "موت", property_damage: "املاک کا نقصان", environmental: "ماحولیاتی واقعہ" } as Record<SafetyIncidentKind, string>,
    statuses: { open: "کھلا", investigating: "تحقیقات جاری", closed: "بند" } as Record<string, string>,
    permitTypes: { hot_work: "گرم کام", work_at_height: "بلندی پر کام", confined_space: "بند جگہ", excavation: "کھدائی", electrical: "برقی کام", lifting: "اٹھانا", other: "دیگر" } as Record<PermitType, string>,
    states: { active: "فعال", expired: "میعاد ختم", not_started: "شروع نہیں ہوا", closed: "بند", cancelled: "منسوخ" } as Record<PermitState, string>,
    noIncidents: "کوئی واقعہ درج نہیں۔", noPermits: "کوئی اجازت نامہ نہیں۔", record: "واقعہ درج کریں", issue: "اجازت نامہ جاری کریں", save: "محفوظ کریں", cancel: "منسوخ", saved: "محفوظ ہو گیا۔",
    number: "نمبر", date: "تاریخ", kind: "قسم", title: "عنوان", description: "تفصیل", location: "مقام", people: "متاثرہ افراد", lostDays: "ضائع کام کے دن",
    rootCause: "بنیادی وجہ", correctiveAction: "اصلاحی اقدام", investigate: "تحقیقات شروع کریں", closeIncident: "واقعہ بند کریں",
    permitType: "کام کی قسم", responsible: "ذمہ دار فریق", validFrom: "آغاز", validTo: "اختتام", closePermit: "اجازت نامہ بند کریں", cancelPermit: "اجازت نامہ منسوخ کریں", note: "نوٹ",
    window: (from: string, to: string) => `${from} ← ${to}`, reportedBy: "درج کنندہ",
  },
};
type T = (typeof text)["en"];
const LOST_TIME: readonly string[] = ["lost_time", "fatality"];
const num = (value: number | null) => (value === null ? null : formatAmount(value, 2));

export default function ProjectSafety() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [view, setView] = useState<"indicators" | "incidents" | "permits">("indicators");
  const query = trpc.safety.register.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const data = query.data;
  const refresh = () => void query.refetch();
  return (
    <PageMain>
      <PageHeader><h1 className="text-2xl font-semibold">{pickLanguage(language, PAGE_NAMES.safety)}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
      {query.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(query.error, language === "ar")}</p> : null}
      <div className="mb-4"><Segmented label={t.views} value={view} onValueChange={value => setView(value as typeof view)} options={[{ value: "indicators", label: t.indicators }, { value: "incidents", label: t.incidents }, { value: "permits", label: t.permits }]} /></div>
      {data && view === "indicators" ? <Indicators rates={data.rates} t={t} /> : null}
      {data && view === "incidents" ? <Incidents incidents={data.incidents} t={t} tenantId={tenantId} projectId={projectId} onChanged={refresh} /> : null}
      {data && view === "permits" ? <Permits permits={data.permits as Permit[]} t={t} tenantId={tenantId} projectId={projectId} onChanged={refresh} /> : null}
    </PageMain>
  );
}

type Rates = { manHours: number; lostTime: number; recordable: number; byKind: Record<SafetyIncidentKind, number>; ltifr: number | null; trir: number | null; daysWithoutHours: number; reports: number };
export function Indicators({ rates, t }: { rates: Rates; t: T }) {
  return (
    <section aria-label={t.indicators} className="flex flex-col gap-4" data-safety-indicators>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t.ltifr} value={<span data-ltifr>{num(rates.ltifr) ?? "—"}</span>} detail={t.ltifrHow} />
        <MetricCard label={t.trir} value={<span data-trir>{num(rates.trir) ?? "—"}</span>} detail={t.trirHow} />
        <MetricCard label={t.manHours} value={<span data-man-hours>{rates.manHours ? num(rates.manHours) : t.noHours}</span>} detail={t.manHoursHow(rates.reports)} />
        <MetricCard label={t.lostTime} value={rates.lostTime} detail={`${t.recordable}: ${rates.recordable}`} />
      </div>
      {rates.daysWithoutHours ? <p className="text-sm text-muted-foreground" data-days-without-hours>{t.daysWithoutHours(rates.daysWithoutHours)}</p> : null}
      <Card><CardHeader><CardTitle>{t.byKind}</CardTitle></CardHeader><CardBody>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">{SAFETY_INCIDENT_KINDS.map(kind => <li key={kind} className="flex justify-between gap-3" data-kind={kind}><span>{t.kinds[kind]}</span><span className="font-semibold tabular-nums">{rates.byKind[kind]}</span></li>)}</ul>
      </CardBody></Card>
    </section>
  );
}

type Incident = { id: string; incidentNumber: string; occurredOn: string; kind: SafetyIncidentKind; title: string; description: string; location: string | null; peopleInvolved: number; lostDays: number; rootCause: string | null; correctiveAction: string | null; status: string; reportedBy: string | null };
function Incidents({ incidents, t, tenantId, projectId, onChanged }: { incidents: Incident[]; t: T; tenantId: string; projectId: string; onChanged: () => void }) {
  const { language } = useLanguage();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={t.incidents} className="flex flex-col gap-3">
      <WriteGate permission={WRITERS} projectId={projectId}>{!adding ? <div><Button onClick={() => setAdding(true)}>{t.record}</Button></div> : <IncidentForm t={t} tenantId={tenantId} projectId={projectId} onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />}</WriteGate>
      {!incidents.length ? <p className="text-sm text-muted-foreground">{t.noIncidents}</p> : null}
      {incidents.map(incident => (
        <Card key={incident.id} data-incident={incident.incidentNumber}><CardBody className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <bdi dir="ltr" className="font-semibold">{incident.incidentNumber}</bdi><span className="font-medium">{incident.title}</span>
            <Badge tone={LOST_TIME.includes(incident.kind) ? "danger" : incident.kind === "near_miss" ? "info" : "warning"}>{t.kinds[incident.kind]}</Badge>
            <Badge tone={incident.status === "closed" ? "neutral" : "primary"}>{t.statuses[incident.status] ?? incident.status}</Badge>
          </div>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <div className="flex gap-2"><dt className="text-muted-foreground">{t.date}</dt><dd>{formatDate(incident.occurredOn, language)}</dd></div>
            {incident.location ? <div className="flex gap-2"><dt className="text-muted-foreground">{t.location}</dt><dd>{incident.location}</dd></div> : null}
            {incident.lostDays ? <div className="flex gap-2"><dt className="text-muted-foreground">{t.lostDays}</dt><dd className="tabular-nums">{incident.lostDays}</dd></div> : null}
            {incident.rootCause ? <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t.rootCause}</dt><dd>{incident.rootCause}</dd></div> : null}
            {incident.correctiveAction ? <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t.correctiveAction}</dt><dd>{incident.correctiveAction}</dd></div> : null}
          </dl>
          {incident.status !== "closed" ? <WriteGate permission={WRITERS} projectId={projectId}><IncidentProgress incident={incident} t={t} tenantId={tenantId} projectId={projectId} onDone={onChanged} /></WriteGate> : null}
        </CardBody></Card>
      ))}
    </section>
  );
}

const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
function IncidentForm({ t, tenantId, projectId, onDone, onCancel }: { t: T; tenantId: string; projectId: string; onDone: () => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const [form, setForm] = useState({ incidentNumber: "", occurredOn: today(), kind: "near_miss" as SafetyIncidentKind, title: "", description: "", location: "", peopleInvolved: "0", lostDays: "0" });
  const mutation = trpc.safety.recordIncident.useMutation({ onSuccess: onDone });
  const lostAllowed = LOST_TIME.includes(form.kind);
  const ready = form.incidentNumber.trim() && form.title.trim().length >= 2 && form.description.trim().length >= 2 && form.occurredOn;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate({ tenantId, projectId, incidentNumber: form.incidentNumber.trim(), occurredOn: form.occurredOn, kind: form.kind, title: form.title.trim(), description: form.description.trim(), location: form.location.trim() || undefined, peopleInvolved: Number(form.peopleInvolved) || 0, lostDays: lostAllowed ? Number(form.lostDays) || 0 : 0 });
  };
  return (
    <form noValidate onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2" data-incident-form>
      <Field label={t.number} required>{props => <TextInput {...props} dir="ltr" value={form.incidentNumber} maxLength={60} onChange={event => setForm({ ...form, incidentNumber: event.target.value })} />}</Field>
      <Field label={t.date} required>{props => <TextInput {...props} type="date" lang="en" value={form.occurredOn} max={today()} onChange={event => setForm({ ...form, occurredOn: event.target.value })} />}</Field>
      <Field label={t.kind}>{props => <Select id={props.id} value={form.kind} onValueChange={kind => setForm({ ...form, kind: kind as SafetyIncidentKind })} options={SAFETY_INCIDENT_KINDS.map(value => ({ value, label: t.kinds[value] }))} />}</Field>
      <Field label={t.title} required>{props => <TextInput {...props} value={form.title} maxLength={255} onChange={event => setForm({ ...form, title: event.target.value })} />}</Field>
      <Field label={t.description} required className="sm:col-span-2">{props => <Textarea {...props} value={form.description} maxLength={4000} onChange={event => setForm({ ...form, description: event.target.value })} />}</Field>
      <Field label={t.location} optional>{props => <TextInput {...props} value={form.location} maxLength={160} onChange={event => setForm({ ...form, location: event.target.value })} />}</Field>
      <Field label={t.people}>{props => <TextInput {...props} type="number" inputMode="numeric" lang="en" min={0} value={form.peopleInvolved} onChange={event => setForm({ ...form, peopleInvolved: event.target.value })} />}</Field>
      {lostAllowed ? <Field label={t.lostDays}>{props => <TextInput {...props} type="number" inputMode="numeric" lang="en" min={0} value={form.lostDays} onChange={event => setForm({ ...form, lostDays: event.target.value })} />}</Field> : null}
      {mutation.error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={!ready || mutation.isPending}>{t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    </form>
  );
}

function IncidentProgress({ incident, t, tenantId, projectId, onDone }: { incident: Incident; t: T; tenantId: string; projectId: string; onDone: () => void }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ rootCause: incident.rootCause ?? "", correctiveAction: incident.correctiveAction ?? "" });
  const mutation = trpc.safety.updateIncident.useMutation({ onSuccess: () => { setOpen(false); onDone(); } });
  const send = (status?: "investigating" | "closed") => mutation.mutate({ tenantId, projectId, incidentId: incident.id, status, rootCause: form.rootCause.trim() || null, correctiveAction: form.correctiveAction.trim() || null });
  if (!open) return <div className="flex flex-wrap gap-2">{incident.status === "open" ? <Button variant="secondary" onClick={() => send("investigating")}>{t.investigate}</Button> : null}<Button variant="secondary" onClick={() => setOpen(true)}>{t.closeIncident}</Button></div>;
  return (
    <form noValidate onSubmit={event => { event.preventDefault(); send("closed"); }} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-incident-close>
      <Field label={t.rootCause} optional>{props => <Textarea {...props} value={form.rootCause} maxLength={4000} onChange={event => setForm({ ...form, rootCause: event.target.value })} />}</Field>
      <Field label={t.correctiveAction} required>{props => <Textarea {...props} value={form.correctiveAction} maxLength={4000} onChange={event => setForm({ ...form, correctiveAction: event.target.value })} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2"><Button type="submit" disabled={!form.correctiveAction.trim() || mutation.isPending}>{t.closeIncident}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </form>
  );
}

type Permit = { id: string; permitNumber: string; permitType: PermitType; description: string; location: string | null; responsibleParty: string | null; validFrom: string | Date; validTo: string | Date; state: PermitState; closeNote: string | null };
function Permits({ permits, t, tenantId, projectId, onChanged }: { permits: Permit[]; t: T; tenantId: string; projectId: string; onChanged: () => void }) {
  const { language } = useLanguage();
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={t.permits} className="flex flex-col gap-3">
      <WriteGate permission={WRITERS} projectId={projectId}>{!adding ? <div><Button onClick={() => setAdding(true)}>{t.issue}</Button></div> : <PermitForm t={t} tenantId={tenantId} projectId={projectId} onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />}</WriteGate>
      {!permits.length ? <p className="text-sm text-muted-foreground">{t.noPermits}</p> : null}
      {permits.map(permit => (
        <Card key={permit.id} data-permit={permit.permitNumber}><CardBody className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <bdi dir="ltr" className="font-semibold">{permit.permitNumber}</bdi><span className="font-medium">{t.permitTypes[permit.permitType]}</span>
            <Badge tone={STATE_TONE[permit.state]}><span data-permit-state={permit.state}>{t.states[permit.state]}</span></Badge>
          </div>
          <p>{permit.description}</p>
          <p className="text-muted-foreground"><bdi dir="ltr">{t.window(formatDateTime(permit.validFrom, language), formatDateTime(permit.validTo, language))}</bdi>{permit.location ? ` · ${permit.location}` : ""}{permit.responsibleParty ? ` · ${permit.responsibleParty}` : ""}</p>
          {permit.closeNote ? <p className="text-muted-foreground">{t.note}: {permit.closeNote}</p> : null}
          {permit.state === "active" || permit.state === "expired" || permit.state === "not_started" ? <WriteGate permission={WRITERS} projectId={projectId}><PermitClose permit={permit} t={t} tenantId={tenantId} projectId={projectId} onDone={onChanged} /></WriteGate> : null}
        </CardBody></Card>
      ))}
    </section>
  );
}

const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
function PermitForm({ t, tenantId, projectId, onDone, onCancel }: { t: T; tenantId: string; projectId: string; onDone: () => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const now = new Date();
  const [form, setForm] = useState({ permitNumber: "", permitType: "hot_work" as PermitType, description: "", location: "", responsibleParty: "", validFrom: localInput(now), validTo: localInput(new Date(now.getTime() + 8 * 3_600_000)) });
  const mutation = trpc.safety.issuePermit.useMutation({ onSuccess: onDone });
  const from = new Date(form.validFrom); const to = new Date(form.validTo);
  const windowOk = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from;
  const ready = form.permitNumber.trim() && form.description.trim().length >= 2 && windowOk;
  return (
    <form noValidate onSubmit={event => { event.preventDefault(); mutation.mutate({ tenantId, projectId, permitNumber: form.permitNumber.trim(), permitType: form.permitType, description: form.description.trim(), location: form.location.trim() || undefined, responsibleParty: form.responsibleParty.trim() || undefined, validFrom: from, validTo: to }); }} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2" data-permit-form>
      <Field label={t.number} required>{props => <TextInput {...props} dir="ltr" value={form.permitNumber} maxLength={60} onChange={event => setForm({ ...form, permitNumber: event.target.value })} />}</Field>
      <Field label={t.permitType}>{props => <Select id={props.id} value={form.permitType} onValueChange={permitType => setForm({ ...form, permitType: permitType as PermitType })} options={PERMIT_TYPES.map(value => ({ value, label: t.permitTypes[value] }))} />}</Field>
      <Field label={t.description} required className="sm:col-span-2">{props => <Textarea {...props} value={form.description} maxLength={4000} onChange={event => setForm({ ...form, description: event.target.value })} />}</Field>
      <Field label={t.validFrom} required>{props => <TextInput {...props} type="datetime-local" lang="en" dir="ltr" value={form.validFrom} onChange={event => setForm({ ...form, validFrom: event.target.value })} />}</Field>
      <Field label={t.validTo} required error={windowOk ? undefined : getLocalizedProjectError({ message: "PROJECT_OS_SAFETY_PERMIT_WINDOW_INVALID" } as never, language === "ar")}>{props => <TextInput {...props} type="datetime-local" lang="en" dir="ltr" value={form.validTo} onChange={event => setForm({ ...form, validTo: event.target.value })} />}</Field>
      <Field label={t.location} optional>{props => <TextInput {...props} value={form.location} maxLength={160} onChange={event => setForm({ ...form, location: event.target.value })} />}</Field>
      <Field label={t.responsible} optional>{props => <TextInput {...props} value={form.responsibleParty} maxLength={160} onChange={event => setForm({ ...form, responsibleParty: event.target.value })} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={!ready || mutation.isPending}>{t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    </form>
  );
}

function PermitClose({ permit, t, tenantId, projectId, onDone }: { permit: Permit; t: T; tenantId: string; projectId: string; onDone: () => void }) {
  const { language } = useLanguage();
  const [outcome, setOutcome] = useState<"closed" | "cancelled" | null>(null);
  const [note, setNote] = useState("");
  const mutation = trpc.safety.closePermit.useMutation({ onSuccess: () => { setOutcome(null); onDone(); } });
  if (!outcome) return <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setOutcome("closed")}>{t.closePermit}</Button><Button variant="ghost" onClick={() => setOutcome("cancelled")}>{t.cancelPermit}</Button></div>;
  return (
    <form noValidate onSubmit={event => { event.preventDefault(); mutation.mutate({ tenantId, projectId, permitId: permit.id, outcome, note: note.trim() }); }} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-permit-close>
      <Field label={t.note} required>{props => <Textarea {...props} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2"><Button type="submit" disabled={note.trim().length < 3 || mutation.isPending}>{outcome === "closed" ? t.closePermit : t.cancelPermit}</Button><Button type="button" variant="ghost" onClick={() => setOutcome(null)}>{t.cancel}</Button></div>
    </form>
  );
}
