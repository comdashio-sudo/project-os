// Q-27 (P-116): the project's risk register as a page — the 5×5 matrix of live risks (probability up, impact across; a cell is a button that filters
// the register to it), the «review overdue» list, and the register itself: each risk with its score, band, owner, response plan and review date; and,
// for whoever holds pmo.write on the project, edit, close (with a reason) and «turn into an issue». The numbers come from the server (pmo.projectRisks,
// computed in shared/riskMatrix.ts): a cell here is the server's count, never a count of its own. Every rule is the server's (server/projectRisks.ts).
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput } from "@/components/ds";
import { formatDate } from "@/components/ds/format";
import { OwnerSelect } from "@/components/OwnerSelect";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SectionErrorBoundary } from "@/components/SectionResilience";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { PAGE_NAMES } from "@shared/pageNames";
import { RISK_SCALE, type RiskLevel, type RiskStatus } from "@shared/riskMatrix";

const WRITERS = ["pmo.write"] as const;
const text = {
  ar: {
    intro: "سجل مخاطر المشروع: المصفوفة تعدّ المخاطر الحية (غير المغلقة) بالاحتمال والأثر، والضغط على خلية يعرض مخاطرها. الدرجة = الاحتمال × الأثر.",
    matrix: "مصفوفة المخاطر 5×5", probability: "الاحتمال", impact: "الأثر", cell: (p: number, s: number, n: number) => `الاحتمال ${p}، الأثر ${s}: ${n} خطر`,
    live: (n: number) => `المخاطر الحية: ${n}`, showAll: "عرض الكل", filtered: (p: number, s: number) => `المعروض: الاحتمال ${p} × الأثر ${s}`,
    overdue: "مراجعة متأخرة", overdueNone: "لا خطر تجاوز موعد مراجعته.", unscheduled: (n: number) => `بلا موعد مراجعة: ${n}`, asOf: (d: string) => `حتى يوم الموقع ${d}`,
    register: "السجل", none: "لا مخاطر في هذا المشروع بعد. تُسجَّل من لوحة PMO.", noneInCell: "لا مخاطر في هذه الخلية.",
    score: "الدرجة", owner: "المالك", noOwner: "بلا مالك", review: "المراجعة القادمة", noReview: "بلا موعد", response: "خطة الاستجابة", mitigation: "التخفيف",
    status: "الحالة", edit: "تعديل", close: "إغلاق", toIssue: "تحويل إلى قضية", history: "السجل التاريخي", hideHistory: "إخفاء السجل", save: "حفظ", cancel: "إلغاء",
    reason: "سبب الإغلاق", issueCode: "رمز القضية", priority: "الأولوية", saved: "حُفظ.", closedNote: (r: string) => `أُغلق: ${r}`, becameIssue: (c: string) => `تحوّل إلى القضية ${c}`,
    nothingChanged: "لا تغيير لحفظه.", overdueTag: "متأخرة",
    levels: { low: "منخفض", medium: "متوسط", high: "مرتفع", critical: "حرج" }, statuses: { open: "مفتوح", mitigating: "قيد التخفيف", accepted: "مقبول", closed: "مغلق" },
    priorities: { low: "منخفضة", medium: "متوسطة", high: "مرتفعة", critical: "حرجة" },
    actions: { "pmo.risk_created": "أُنشئ", "pmo.risk_updated": "عُدّل", "pmo.risk_closed": "أُغلق", "pmo.risk_converted": "تحوّل إلى قضية" } as Record<string, string>,
    fields: { title: "العنوان", probability: "الاحتمال", severity: "الأثر", status: "الحالة", ownerMembershipId: "المالك", nextReviewAt: "المراجعة", response: "الاستجابة", mitigation: "التخفيف", cause: "السبب", impact: "الأثر الوصفي", trigger: "المؤشر", residualProbability: "الاحتمال المتبقي", residualSeverity: "الأثر المتبقي" } as Record<string, string>,
  },
  en: {
    intro: "The project's risk register: the matrix counts the live (not closed) risks by probability and impact; tap a cell to see its risks. Score = probability × impact.",
    matrix: "5×5 risk matrix", probability: "Probability", impact: "Impact", cell: (p: number, s: number, n: number) => `Probability ${p}, impact ${s}: ${n} risks`,
    live: (n: number) => `Live risks: ${n}`, showAll: "Show all", filtered: (p: number, s: number) => `Showing: probability ${p} × impact ${s}`,
    overdue: "Review overdue", overdueNone: "No risk is past its review date.", unscheduled: (n: number) => `No review date: ${n}`, asOf: (d: string) => `As of site day ${d}`,
    register: "Register", none: "No risks in this project yet. They are registered from the PMO board.", noneInCell: "No risks in this cell.",
    score: "Score", owner: "Owner", noOwner: "No owner", review: "Next review", noReview: "Not scheduled", response: "Response plan", mitigation: "Mitigation",
    status: "Status", edit: "Edit", close: "Close", toIssue: "Turn into an issue", history: "History", hideHistory: "Hide history", save: "Save", cancel: "Cancel",
    reason: "Reason for closing", issueCode: "Issue code", priority: "Priority", saved: "Saved.", closedNote: (r: string) => `Closed: ${r}`, becameIssue: (c: string) => `Became issue ${c}`,
    nothingChanged: "Nothing changed to save.", overdueTag: "Overdue",
    levels: { low: "Low", medium: "Medium", high: "High", critical: "Critical" }, statuses: { open: "Open", mitigating: "Mitigating", accepted: "Accepted", closed: "Closed" },
    priorities: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
    actions: { "pmo.risk_created": "Created", "pmo.risk_updated": "Updated", "pmo.risk_closed": "Closed", "pmo.risk_converted": "Turned into an issue" } as Record<string, string>,
    fields: { title: "Title", probability: "Probability", severity: "Impact", status: "Status", ownerMembershipId: "Owner", nextReviewAt: "Review", response: "Response", mitigation: "Mitigation", cause: "Cause", impact: "Impact (text)", trigger: "Trigger", residualProbability: "Residual probability", residualSeverity: "Residual impact" } as Record<string, string>,
  },
  ur: {
    intro: "پروجیکٹ کا خطرات کا رجسٹر: میٹرکس زندہ (غیر بند) خطرات کو امکان اور اثر کے لحاظ سے گنتا ہے؛ کسی خانے پر ٹیپ کریں تو اس کے خطرات دکھیں گے۔ درجہ = امکان × اثر۔",
    matrix: "خطرات کا 5×5 میٹرکس", probability: "امکان", impact: "اثر", cell: (p: number, s: number, n: number) => `امکان ${p}، اثر ${s}: ${n} خطرات`,
    live: (n: number) => `زندہ خطرات: ${n}`, showAll: "سب دکھائیں", filtered: (p: number, s: number) => `دکھایا جا رہا ہے: امکان ${p} × اثر ${s}`,
    overdue: "جائزہ تاخیر سے", overdueNone: "کوئی خطرہ اپنی جائزے کی تاریخ سے آگے نہیں۔", unscheduled: (n: number) => `جائزے کی تاریخ نہیں: ${n}`, asOf: (d: string) => `سائٹ کے دن ${d} تک`,
    register: "رجسٹر", none: "اس پروجیکٹ میں ابھی کوئی خطرہ نہیں۔ خطرات PMO بورڈ سے درج ہوتے ہیں۔", noneInCell: "اس خانے میں کوئی خطرہ نہیں۔",
    score: "درجہ", owner: "مالک", noOwner: "کوئی مالک نہیں", review: "اگلا جائزہ", noReview: "طے نہیں", response: "ردعمل کا منصوبہ", mitigation: "تخفیف",
    status: "حیثیت", edit: "ترمیم", close: "بند کریں", toIssue: "مسئلے میں تبدیل کریں", history: "تاریخچہ", hideHistory: "تاریخچہ چھپائیں", save: "محفوظ کریں", cancel: "منسوخ",
    reason: "بند کرنے کی وجہ", issueCode: "مسئلے کا کوڈ", priority: "ترجیح", saved: "محفوظ ہو گیا۔", closedNote: (r: string) => `بند: ${r}`, becameIssue: (c: string) => `مسئلہ ${c} بن گیا`,
    nothingChanged: "محفوظ کرنے کے لیے کوئی تبدیلی نہیں۔", overdueTag: "تاخیر",
    levels: { low: "کم", medium: "درمیانہ", high: "زیادہ", critical: "سنگین" }, statuses: { open: "کھلا", mitigating: "تخفیف جاری", accepted: "قبول شدہ", closed: "بند" },
    priorities: { low: "کم", medium: "درمیانی", high: "زیادہ", critical: "سنگین" },
    actions: { "pmo.risk_created": "بنایا گیا", "pmo.risk_updated": "ترمیم ہوئی", "pmo.risk_closed": "بند ہوا", "pmo.risk_converted": "مسئلے میں تبدیل ہوا" } as Record<string, string>,
    fields: { title: "عنوان", probability: "امکان", severity: "اثر", status: "حیثیت", ownerMembershipId: "مالک", nextReviewAt: "جائزہ", response: "ردعمل", mitigation: "تخفیف", cause: "وجہ", impact: "اثر (متن)", trigger: "اشارہ", residualProbability: "باقی امکان", residualSeverity: "باقی اثر" } as Record<string, string>,
  },
};
type T = (typeof text)["en"];

/** The band's colour, from the identity's tokens; the band's name is always written beside it (colour is never the only signal). */
export const LEVEL_CLASS: Record<RiskLevel, string> = {
  low: "bg-success-soft text-success-soft-foreground",
  medium: "bg-warning-soft text-warning-soft-foreground",
  high: "bg-warning text-warning-foreground",
  critical: "bg-destructive text-destructive-foreground",
};
const levelOf = (score: number): RiskLevel => (score >= 15 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low");

type Risk = { id: string; code: string; title: string; probability: number; severity: number; score: number; level: RiskLevel; status: RiskStatus; ownerMembershipId: string | null; ownerName: string | null; nextReviewAt: string | null; reviewOverdue: boolean; response: string | null; mitigation: string | null; closureReason: string | null; issueId: string | null };

/** The matrix: probability 5 at the top down to 1, impact 1 to 5 across. `cells[p-1][s-1]` is the server's count. */
export function RiskMatrix({ cells, t, picked, onPick }: { cells: number[][]; t: T; picked: [number, number] | null; onPick: (cell: [number, number] | null) => void }) {
  const { language } = useLanguage();
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-sm" data-risk-matrix>
        <caption className="sr-only">{t.matrix}</caption>
        <thead><tr><th scope="col" className="text-xs font-medium text-muted-foreground">{t.probability} ↑ / {t.impact} {language === "en" ? "→" : "←"}</th>{RISK_SCALE.map(s => <th key={s} scope="col" className="w-12 text-center text-xs font-medium text-muted-foreground">{s}</th>)}</tr></thead>
        <tbody>
          {[...RISK_SCALE].reverse().map(p => (
            <tr key={p}>
              <th scope="row" className="pe-2 text-center text-xs font-medium text-muted-foreground">{p}</th>
              {RISK_SCALE.map(s => {
                const count = cells[p - 1]?.[s - 1] ?? 0;
                const isPicked = picked?.[0] === p && picked?.[1] === s;
                return (
                  <td key={s} className="p-0">
                    <button type="button" data-cell={`${p}-${s}`} aria-pressed={isPicked} aria-label={t.cell(p, s, count)} onClick={() => onPick(isPicked ? null : [p, s])}
                      className={`h-11 w-12 rounded-md font-semibold tabular-nums ${LEVEL_CLASS[levelOf(p * s)]} ${count ? "" : "opacity-50"} ${isPicked ? "ring-2 ring-ring ring-offset-2" : ""}`}>{count}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectRisks() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const query = trpc.pmo.projectRisks.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const data = query.data;
  const risks = (data?.risks ?? []) as Risk[];
  const shown = useMemo(() => (picked ? risks.filter(risk => risk.status !== "closed" && risk.probability === picked[0] && risk.severity === picked[1]) : risks), [risks, picked]);
  const byId = useMemo(() => new Map(risks.map(risk => [risk.id, risk])), [risks]);
  return (
    <PageMain>
      <PageTitle title={pickLanguage(language, PAGE_NAMES.risks)} description={t.intro} />
      {query.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(query.error, language === "ar")}</p> : null}
      {data ? (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Card>
            <CardHeader><CardTitle>{t.matrix}</CardTitle></CardHeader>
            <CardBody className="flex flex-col gap-2">
              <RiskMatrix cells={data.matrix.cells} t={t} picked={picked} onPick={setPicked} />
              <p className="text-sm text-muted-foreground" data-live-count>{t.live(data.matrix.live)}</p>
              <ul className="flex flex-wrap gap-2 text-xs">{(["critical", "high", "medium", "low"] as const).map(level => <li key={level}><span className={`inline-flex rounded-full px-2 py-0.5 ${LEVEL_CLASS[level]}`}>{t.levels[level]}: {data.matrix.byLevel[level]}</span></li>)}</ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.overdue}</CardTitle></CardHeader>
            <CardBody className="flex flex-col gap-2 text-sm">
              <p className="text-xs text-muted-foreground">{t.asOf(data.asOf)}</p>
              {data.overdueIds.length ? (
                <ul className="divide-y divide-border" data-overdue-list>
                  {data.overdueIds.map(id => byId.get(id)).filter(Boolean).map(risk => (
                    <li key={risk!.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><bdi dir="ltr" className="font-medium">{risk!.code}</bdi> · {risk!.title}</span><span className="text-destructive">{formatDate(risk!.nextReviewAt!, language)}</span></li>
                  ))}
                </ul>
              ) : <p className="text-muted-foreground">{t.overdueNone}</p>}
              {data.unscheduledIds.length ? <p className="text-xs text-muted-foreground">{t.unscheduled(data.unscheduledIds.length)}</p> : null}
            </CardBody>
          </Card>
        </div>
      ) : null}
      {data ? (
        <section aria-label={t.register} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{t.register}</h2>
            {picked ? <><span className="text-sm text-muted-foreground" data-filter>{t.filtered(picked[0], picked[1])}</span><Button variant="secondary" onClick={() => setPicked(null)}>{t.showAll}</Button></> : null}
          </div>
          {!risks.length ? <p className="text-sm text-muted-foreground">{t.none}</p> : !shown.length ? <p className="text-sm text-muted-foreground">{t.noneInCell}</p> : null}
          {shown.map(risk => (
            <SectionErrorBoundary key={risk.id} title={risk.code} isArabic={language === "ar"}><RiskCard risk={risk} t={t} tenantId={tenantId} projectId={projectId} onChanged={() => void query.refetch()} /></SectionErrorBoundary>
          ))}
        </section>
      ) : null}
    </PageMain>
  );
}

function RiskCard({ risk, t, tenantId, projectId, onChanged }: { risk: Risk; t: T; tenantId: string; projectId: string; onChanged: () => void }) {
  const { language } = useLanguage();
  const [mode, setMode] = useState<"view" | "edit" | "close" | "issue">("view");
  const [showHistory, setShowHistory] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const live = risk.status !== "closed";
  return (
    <Card data-risk={risk.code}>
      <CardBody className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <bdi dir="ltr" className="font-semibold">{risk.code}</bdi>
          <span className="font-medium">{risk.title}</span>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${LEVEL_CLASS[risk.level]}`} data-level={risk.level}>{t.levels[risk.level]} · {t.score} {risk.score}</span>
          <Badge tone={live ? "primary" : "neutral"}>{t.statuses[risk.status]}</Badge>
          {risk.reviewOverdue ? <Badge tone="danger">{t.overdueTag}</Badge> : null}
        </div>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-muted-foreground">{t.owner}</dt><dd>{risk.ownerName ?? t.noOwner}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">{t.review}</dt><dd>{risk.nextReviewAt ? formatDate(risk.nextReviewAt, language) : t.noReview}</dd></div>
          {risk.response ? <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t.response}</dt><dd>{risk.response}</dd></div> : null}
          {risk.mitigation ? <div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t.mitigation}</dt><dd>{risk.mitigation}</dd></div> : null}
          {!live && risk.closureReason ? <div className="sm:col-span-2 text-muted-foreground">{risk.closureReason.startsWith("issue:") ? t.becameIssue(risk.closureReason.slice(6)) : t.closedNote(risk.closureReason)}</div> : null}
        </dl>
        {note ? <p role="status" className="text-xs text-muted-foreground">{note}</p> : null}
        <div className="flex flex-wrap gap-2">
          {live && mode === "view" ? (
            <WriteGate permission={WRITERS} projectId={projectId}>
              <Button variant="secondary" onClick={() => setMode("edit")}>{t.edit}</Button>
              <Button variant="secondary" onClick={() => setMode("close")}>{t.close}</Button>
              <Button variant="secondary" onClick={() => setMode("issue")}>{t.toIssue}</Button>
            </WriteGate>
          ) : null}
          <Button variant="ghost" onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory}>{showHistory ? t.hideHistory : t.history}</Button>
        </div>
        {mode === "edit" ? <RiskEditForm risk={risk} t={t} tenantId={tenantId} projectId={projectId} onDone={message => { setMode("view"); setNote(message); onChanged(); }} onCancel={() => setMode("view")} /> : null}
        {mode === "close" ? <RiskCloseForm risk={risk} t={t} tenantId={tenantId} projectId={projectId} onDone={() => { setMode("view"); onChanged(); }} onCancel={() => setMode("view")} /> : null}
        {mode === "issue" ? <RiskIssueForm risk={risk} t={t} tenantId={tenantId} projectId={projectId} onDone={() => { setMode("view"); onChanged(); }} onCancel={() => setMode("view")} /> : null}
        {showHistory ? <RiskHistory riskId={risk.id} t={t} tenantId={tenantId} projectId={projectId} /> : null}
      </CardBody>
    </Card>
  );
}

const scaleOptions = RISK_SCALE.map(value => ({ value: String(value), label: String(value) }));

function RiskEditForm({ risk, t, tenantId, projectId, onDone, onCancel }: { risk: Risk; t: T; tenantId: string; projectId: string; onDone: (message: string) => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const [form, setForm] = useState({ status: risk.status === "closed" ? "open" : risk.status, owner: risk.ownerMembershipId ?? "", nextReviewAt: risk.nextReviewAt ?? "", probability: String(risk.probability), severity: String(risk.severity), response: risk.response ?? "", mitigation: risk.mitigation ?? "" });
  const mutation = trpc.pmo.updateRisk.useMutation({ onSuccess: result => onDone(result.changed.length ? t.saved : t.nothingChanged) });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate({ tenantId, projectId, riskId: risk.id, patch: { status: form.status as "open" | "mitigating" | "accepted", ownerMembershipId: form.owner || null, nextReviewAt: form.nextReviewAt || null, probability: Number(form.probability), severity: Number(form.severity), response: form.response, mitigation: form.mitigation } });
  };
  return (
    <form noValidate onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2" data-risk-edit>
      <Field label={t.status}>{props => <Select id={props.id} value={form.status} onValueChange={status => setForm({ ...form, status: status as typeof form.status })} options={(["open", "mitigating", "accepted"] as const).map(value => ({ value, label: t.statuses[value] }))} />}</Field>
      <Field label={t.owner}>{props => <OwnerSelect id={props.id} tenantId={tenantId} projectId={projectId} value={form.owner} onChange={owner => setForm({ ...form, owner })} />}</Field>
      <Field label={t.probability}>{props => <Select id={props.id} value={form.probability} onValueChange={probability => setForm({ ...form, probability })} options={scaleOptions} />}</Field>
      <Field label={t.impact}>{props => <Select id={props.id} value={form.severity} onValueChange={severity => setForm({ ...form, severity })} options={scaleOptions} />}</Field>
      <Field label={t.review}>{props => <TextInput {...props} type="date" lang="en" value={form.nextReviewAt} onChange={event => setForm({ ...form, nextReviewAt: event.target.value })} />}</Field>
      <Field label={t.response} className="sm:col-span-2">{props => <Textarea {...props} value={form.response} maxLength={4000} onChange={event => setForm({ ...form, response: event.target.value })} />}</Field>
      <Field label={t.mitigation} className="sm:col-span-2">{props => <Textarea {...props} value={form.mitigation} maxLength={4000} onChange={event => setForm({ ...form, mitigation: event.target.value })} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={mutation.isPending}>{t.save}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    </form>
  );
}

function RiskCloseForm({ risk, t, tenantId, projectId, onDone, onCancel }: { risk: Risk; t: T; tenantId: string; projectId: string; onDone: () => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const [reason, setReason] = useState("");
  const mutation = trpc.pmo.closeRisk.useMutation({ onSuccess: onDone });
  return (
    <form noValidate onSubmit={event => { event.preventDefault(); mutation.mutate({ tenantId, projectId, riskId: risk.id, reason }); }} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-risk-close>
      <Field label={t.reason}>{props => <Textarea {...props} value={reason} required minLength={3} maxLength={2000} onChange={event => setReason(event.target.value)} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2"><Button type="submit" disabled={mutation.isPending || reason.trim().length < 3}>{t.close}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    </form>
  );
}

function RiskIssueForm({ risk, t, tenantId, projectId, onDone, onCancel }: { risk: Risk; t: T; tenantId: string; projectId: string; onDone: () => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const [issueCode, setIssueCode] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">(risk.level === "critical" ? "critical" : risk.level === "high" ? "high" : "medium");
  const mutation = trpc.pmo.convertRiskToIssue.useMutation({ onSuccess: onDone });
  return (
    <form noValidate onSubmit={event => { event.preventDefault(); mutation.mutate({ tenantId, projectId, riskId: risk.id, issueCode, priority }); }} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2" data-risk-issue>
      <Field label={t.issueCode}>{props => <TextInput {...props} dir="ltr" value={issueCode} required maxLength={80} onChange={event => setIssueCode(event.target.value)} />}</Field>
      <Field label={t.priority}>{props => <Select id={props.id} value={priority} onValueChange={value => setPriority(value as typeof priority)} options={(["low", "medium", "high", "critical"] as const).map(value => ({ value, label: t.priorities[value] }))} />}</Field>
      {mutation.error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{getLocalizedProjectError(mutation.error, language === "ar")}</p> : null}
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={mutation.isPending || !issueCode.trim()}>{t.toIssue}</Button><Button type="button" variant="ghost" onClick={onCancel}>{t.cancel}</Button></div>
    </form>
  );
}

function RiskHistory({ riskId, t, tenantId, projectId }: { riskId: string; t: T; tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const history = trpc.pmo.riskHistory.useQuery({ tenantId, projectId, riskId });
  if (history.error) return <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(history.error, language === "ar")}</p>;
  const show = (field: string, value: unknown) => (value === null || value === undefined || value === "" ? "—" : field === "status" ? t.statuses[value as RiskStatus] ?? String(value) : String(value));
  return (
    <ol className="flex flex-col gap-2 border-s-2 border-border ps-3 text-xs" data-risk-history>
      {(history.data ?? []).map(entry => (
        <li key={entry.id}>
          <span className="font-medium">{t.actions[entry.action] ?? entry.action}</span> · {entry.actorName ?? "—"} · <bdi dir="ltr">{formatDate(entry.createdAt, language)}</bdi>
          {Object.entries(entry.changes).length ? <ul className="mt-1 text-muted-foreground">{Object.entries(entry.changes).map(([field, change]) => <li key={field}>{t.fields[field] ?? field}: <bdi>{show(field, change.from)}</bdi> {language === "en" ? "→" : "←"} <bdi>{show(field, change.to)}</bdi></li>)}</ul> : null}
          {entry.reason ? <p className="text-muted-foreground">{entry.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
