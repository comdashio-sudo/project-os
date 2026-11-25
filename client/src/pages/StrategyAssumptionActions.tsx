import React, { useState } from "react";
import { CheckedForm } from "@/components/CheckedForm";
import { Select } from "@/components/ds/Select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { useCan } from "@/lib/permissions";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// Q-21 (b), batch 2: the assumptions register is worked from the screen — a new assumption is entered as a draft, submitted, approved or returned,
// and an approved one changes only through a change request that another person approves. Every rule (who may, separation of duties, the
// locked approved value) is the server's: the buttons only show what the viewer's permissions allow, and a refusal is the server's own message.
const TEXT = {
  ar: {
    add: "إضافة افتراض", cancel: "إلغاء", save: "حفظ كمسودة", code: "الرمز (حروف لاتينية وأرقام)", name: "الاسم", unit: "الوحدة", sourceType: "نوع المصدر", sourceNote: "المصدر ومرجعه",
    confidence: "الثقة", reviewFrequency: "تكرار المراجعة", nextReviewAt: "المراجعة القادمة", conservative: "المتحفظ", base: "الأساسي", optimistic: "المتفائل",
    submit: "إرسال للاعتماد", approve: "اعتماد", return: "إعادة للمُدخِل", returnReason: "سبب الإعادة", requestChange: "طلب تغيير", reason: "سبب التغيير", send: "إرسال الطلب",
    approveChange: "اعتماد التغيير", rejectChange: "رفض التغيير", saved: "حُفظ الافتراض مسودة.", submitted: "أُرسل الافتراض للاعتماد.", approved: "اعتُمد.", returned: "أُعيد إلى المسودة.",
    changeRequested: "سُجّل طلب التغيير وينتظر الاعتماد.", changeApproved: "اعتُمد التغيير وسُجّل في سجل التغييرات.", changeRejected: "رُفض التغيير؛ بقيت القيمة المعتمدة.",
    percent: "نسبة %", sar: "ريال", months: "شهر", days: "يوم", count: "عدد", internal: "داخلي", external: "خارجي", management: "تقدير إداري",
    high: "مرتفعة", medium: "متوسطة", low: "منخفضة", monthly: "شهري", quarterly: "ربعي", annual: "سنوي", event: "عند حدث",
  },
  en: {
    add: "Add an assumption", cancel: "Cancel", save: "Save as draft", code: "Code (Latin letters and digits)", name: "Name", unit: "Unit", sourceType: "Source type", sourceNote: "Source and reference",
    confidence: "Confidence", reviewFrequency: "Review every", nextReviewAt: "Next review", conservative: "Conservative", base: "Base", optimistic: "Optimistic",
    submit: "Submit for approval", approve: "Approve", return: "Return to its author", returnReason: "Why it is returned", requestChange: "Request a change", reason: "Why it changes", send: "Send the request",
    approveChange: "Approve the change", rejectChange: "Reject the change", saved: "The assumption is saved as a draft.", submitted: "The assumption is submitted for approval.", approved: "Approved.", returned: "Returned to draft.",
    changeRequested: "The change request is recorded and awaits approval.", changeApproved: "The change is approved and kept in the change log.", changeRejected: "The change is rejected; the approved value stands.",
    percent: "Percent %", sar: "SAR", months: "Months", days: "Days", count: "Count", internal: "Internal", external: "External", management: "Management estimate",
    high: "High", medium: "Medium", low: "Low", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", event: "On an event",
  },
  ur: {
    add: "مفروضہ شامل کریں", cancel: "منسوخ", save: "مسودے کے طور پر محفوظ کریں", code: "کوڈ (لاطینی حروف اور ہندسے)", name: "نام", unit: "اکائی", sourceType: "ماخذ کی قسم", sourceNote: "ماخذ اور حوالہ",
    confidence: "اعتماد", reviewFrequency: "جائزہ ہر", nextReviewAt: "اگلا جائزہ", conservative: "محتاط", base: "بنیادی", optimistic: "پرامید",
    submit: "منظوری کے لیے بھیجیں", approve: "منظور کریں", return: "لکھنے والے کو واپس کریں", returnReason: "واپسی کی وجہ", requestChange: "تبدیلی کی درخواست", reason: "تبدیلی کی وجہ", send: "درخواست بھیجیں",
    approveChange: "تبدیلی منظور کریں", rejectChange: "تبدیلی مسترد کریں", saved: "مفروضہ مسودے کے طور پر محفوظ ہو گیا۔", submitted: "مفروضہ منظوری کے لیے بھیج دیا گیا۔", approved: "منظور ہو گیا۔", returned: "مسودے میں واپس۔",
    changeRequested: "تبدیلی کی درخواست درج ہو گئی اور منظوری کی منتظر ہے۔", changeApproved: "تبدیلی منظور ہو کر تبدیلیوں کے ریکارڈ میں درج ہو گئی۔", changeRejected: "تبدیلی مسترد؛ منظور شدہ قدر برقرار ہے۔",
    percent: "فیصد %", sar: "ریال", months: "ماہ", days: "دن", count: "تعداد", internal: "اندرونی", external: "بیرونی", management: "انتظامی تخمینہ",
    high: "زیادہ", medium: "درمیانہ", low: "کم", monthly: "ماہانہ", quarterly: "سہ ماہی", annual: "سالانہ", event: "کسی واقعے پر",
  },
} satisfies Record<Language, Record<string, string>>;
type Text = (typeof TEXT)["ar"];

const UNITS = ["percent", "sar", "months", "days", "count"] as const;
const SOURCES = ["internal", "external", "management"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;
const FREQUENCIES = ["monthly", "quarterly", "annual", "event"] as const;

export type AssumptionRow = { id: string; code: string; status: string; pendingChange: unknown | null };

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
function Choice<T extends string>({ id, label, value, options, onChange, t }: { id: string; label: string; value: T; options: readonly T[]; onChange: (value: T) => void; t: Text }) {
  return <Field id={id} label={label}><Select id={id} value={value} onValueChange={next => onChange(next as T)} options={options.map(option => ({ value: option, label: t[option as keyof Text] }))} /></Field>;
}
/** Three scenario values, typed as numbers (Western digits); the server keeps them as given. */
function ScenarioValues({ prefix, values, onChange, t }: { prefix: string; values: Record<"conservative" | "base" | "optimistic", string>; onChange: (values: Record<"conservative" | "base" | "optimistic", string>) => void; t: Text }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{(["conservative", "base", "optimistic"] as const).map(key =>
    <Field key={key} id={`${prefix}-${key}`} label={t[key]}><Input className="min-h-11" id={`${prefix}-${key}`} type="number" step="any" inputMode="decimal" dir="ltr" required value={values[key]} onChange={event => onChange({ ...values, [key]: event.target.value })} /></Field>)}</div>;
}
const numbers = (values: Record<"conservative" | "base" | "optimistic", string>) => ({ conservative: Number(values.conservative), base: Number(values.base), optimistic: Number(values.optimistic) });

function Feedback({ error, notice, language }: { error: unknown; notice: string; language: Language }) {
  if (error) return <p role="alert" data-strategy-error className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, language)}</p>;
  return notice ? <p role="status" className="text-sm text-success-soft-foreground">{notice}</p> : null;
}

const emptyDraft = () => ({ code: "", name: "", unit: "percent" as (typeof UNITS)[number], sourceType: "internal" as (typeof SOURCES)[number], sourceNote: "", confidence: "medium" as (typeof CONFIDENCES)[number], reviewFrequency: "quarterly" as (typeof FREQUENCIES)[number], nextReviewAt: "", values: { conservative: "", base: "", optimistic: "" } });

/** «Add an assumption» — for strategy.manage. The new assumption is a draft: it enters no figure until it is approved. */
export function NewAssumption({ tenantId, language }: { tenantId: string; language: Language }) {
  const t = pickLanguage(language, TEXT);
  const allowed = useCan("strategy.manage");
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [notice, setNotice] = useState("");
  const create = trpc.strategy.createAssumption.useMutation({ onSuccess: () => { setDraft(emptyDraft()); setOpen(false); setNotice(t.saved); void utils.strategy.assumptions.invalidate(); } });
  if (!allowed) return null;
  if (!open) return <div className="grid gap-2"><Feedback error={null} notice={notice} language={language} /><Button type="button" variant="outline" className="min-h-11 justify-self-start" data-strategy-add onClick={() => { setNotice(""); create.reset(); setOpen(true); }}>{t.add}</Button></div>;
  const set = <K extends keyof ReturnType<typeof emptyDraft>>(key: K, value: ReturnType<typeof emptyDraft>[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <CheckedForm data-strategy-new className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3" onSubmit={event => {
    event.preventDefault();
    create.mutate({ tenantId, code: draft.code.trim(), name: draft.name.trim(), unit: draft.unit, sourceType: draft.sourceType, sourceNote: draft.sourceNote.trim() || null, confidence: draft.confidence, reviewFrequency: draft.reviewFrequency, nextReviewAt: draft.nextReviewAt || null, values: numbers(draft.values) });
  }}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field id="sa-code" label={t.code}><Input className="min-h-11" id="sa-code" dir="ltr" required minLength={2} maxLength={60} pattern="[A-Za-z0-9_.\-]+" value={draft.code} onChange={event => set("code", event.target.value)} /></Field>
      <Field id="sa-name" label={t.name}><Input className="min-h-11" id="sa-name" required minLength={2} maxLength={200} value={draft.name} onChange={event => set("name", event.target.value)} /></Field>
      <Choice id="sa-unit" label={t.unit} value={draft.unit} options={UNITS} onChange={value => set("unit", value)} t={t} />
      <Choice id="sa-source" label={t.sourceType} value={draft.sourceType} options={SOURCES} onChange={value => set("sourceType", value)} t={t} />
      <Choice id="sa-confidence" label={t.confidence} value={draft.confidence} options={CONFIDENCES} onChange={value => set("confidence", value)} t={t} />
      <Choice id="sa-frequency" label={t.reviewFrequency} value={draft.reviewFrequency} options={FREQUENCIES} onChange={value => set("reviewFrequency", value)} t={t} />
      <Field id="sa-next" label={t.nextReviewAt}><Input className="min-h-11" id="sa-next" type="date" dir="ltr" value={draft.nextReviewAt} onChange={event => set("nextReviewAt", event.target.value)} /></Field>
      <Field id="sa-note" label={t.sourceNote}><Input className="min-h-11" id="sa-note" maxLength={500} value={draft.sourceNote} onChange={event => set("sourceNote", event.target.value)} /></Field>
    </div>
    <ScenarioValues prefix="sa" values={draft.values} onChange={values => set("values", values)} t={t} />
    <Feedback error={create.error} notice="" language={language} />
    <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={create.isPending}>{t.save}</Button><Button className="min-h-11" type="button" variant="ghost" onClick={() => { setOpen(false); create.reset(); }}>{t.cancel}</Button></div>
  </CheckedForm>;
}

/**
 * The actions one assumption allows, by its state and the viewer's permissions:
 *   draft    → submit (strategy.manage)
 *   pending  → approve, or return with a reason (strategy.approve; the server refuses the person who submitted it)
 *   approved → request a change with new values and a reason (strategy.manage), or — when a change waits — approve or reject it (strategy.approve)
 * A retired assumption has none.
 */
export function AssumptionActions({ tenantId, item, language }: { tenantId: string; item: AssumptionRow; language: Language }) {
  const t = pickLanguage(language, TEXT);
  const canManage = useCan("strategy.manage");
  const canApprove = useCan("strategy.approve");
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<"none" | "return" | "change">("none");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState({ conservative: "", base: "", optimistic: "" });
  // a success clears every earlier refusal on this assumption (each action keeps its own error until reset)
  const done = (message: string) => () => { for (const action of [submit, decide, request, decideChange]) action.reset(); setNotice(message); setForm("none"); setReason(""); void utils.strategy.assumptions.invalidate(); };
  const submit = trpc.strategy.submitAssumption.useMutation({ onSuccess: done(t.submitted) });
  const decide = trpc.strategy.decideAssumption.useMutation();
  const request = trpc.strategy.requestChange.useMutation({ onSuccess: done(t.changeRequested) });
  const decideChange = trpc.strategy.decideChange.useMutation();
  const error = submit.error ?? decide.error ?? request.error ?? decideChange.error;
  const busy = submit.isPending || decide.isPending || request.isPending || decideChange.isPending;
  const base = { tenantId, assumptionId: item.id };
  const buttons: React.ReactNode[] = [];
  if (item.status === "draft" && canManage) buttons.push(<Button className="min-h-11" key="submit" type="button" disabled={busy} data-strategy-action="submit" onClick={() => submit.mutate(base)}>{t.submit}</Button>);
  if (item.status === "pending" && canApprove) {
    buttons.push(<Button className="min-h-11" key="approve" type="button" disabled={busy} data-strategy-action="approve" onClick={() => decide.mutate({ ...base, decision: "approve" }, { onSuccess: done(t.approved) })}>{t.approve}</Button>);
    buttons.push(<Button className="min-h-11" key="return" type="button" variant="outline" disabled={busy} data-strategy-action="return" onClick={() => setForm("return")}>{t.return}</Button>);
  }
  if (item.status === "approved" && item.pendingChange && canApprove) {
    buttons.push(<Button className="min-h-11" key="approve-change" type="button" disabled={busy} data-strategy-action="approve-change" onClick={() => decideChange.mutate({ ...base, decision: "approve" }, { onSuccess: done(t.changeApproved) })}>{t.approveChange}</Button>);
    buttons.push(<Button className="min-h-11" key="reject-change" type="button" variant="outline" disabled={busy} data-strategy-action="reject-change" onClick={() => decideChange.mutate({ ...base, decision: "reject" }, { onSuccess: done(t.changeRejected) })}>{t.rejectChange}</Button>);
  }
  if (item.status === "approved" && !item.pendingChange && canManage) buttons.push(<Button className="min-h-11" key="change" type="button" variant="outline" disabled={busy} data-strategy-action="request-change" onClick={() => setForm("change")}>{t.requestChange}</Button>);
  if (!buttons.length && !notice && !error) return null;
  return <div className="grid gap-2" data-strategy-actions={item.code}>
    {form === "none" && buttons.length ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
    {form === "return" ? <CheckedForm className="grid gap-2" onSubmit={event => { event.preventDefault(); decide.mutate({ ...base, decision: "return", reason: reason.trim() }, { onSuccess: done(t.returned) }); }}>
      <Field id={`sr-${item.id}`} label={t.returnReason}><Textarea id={`sr-${item.id}`} required minLength={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy}>{t.return}</Button><Button className="min-h-11" type="button" variant="ghost" onClick={() => setForm("none")}>{t.cancel}</Button></div>
    </CheckedForm> : null}
    {form === "change" ? <CheckedForm className="grid gap-2" data-strategy-change-form onSubmit={event => { event.preventDefault(); request.mutate({ ...base, values: numbers(values), reason: reason.trim() }); }}>
      <ScenarioValues prefix={`sc-${item.id}`} values={values} onChange={setValues} t={t} />
      <Field id={`sc-reason-${item.id}`} label={t.reason}><Textarea id={`sc-reason-${item.id}`} required minLength={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy}>{t.send}</Button><Button className="min-h-11" type="button" variant="ghost" onClick={() => setForm("none")}>{t.cancel}</Button></div>
    </CheckedForm> : null}
    <Feedback error={error} notice={notice} language={language} />
  </div>;
}
