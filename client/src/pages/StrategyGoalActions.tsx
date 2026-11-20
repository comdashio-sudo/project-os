import React, { useState } from "react";
import { CheckedForm } from "@/components/CheckedForm";
import { Checkbox } from "@/components/ds/Checkbox";
import { Segmented } from "@/components/ds/Segmented";
import { Select } from "@/components/ds/Select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { useCan } from "@/lib/permissions";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// Q-21 (b), batch 2b: goals, initiatives and variances entered from the screen (strategy.manage on the server for each). A variance's actual comes
// from the decided opportunities (the server counts them) or is typed with how many items it rests on; its decision is «adjust the assumption» (a
// change request with new values, approved by someone else) or «an initiative to improve performance» — the goal is never lowered from here.
const TEXT = {
  ar: {
    addGoal: "إضافة هدف", addInitiative: "إضافة مبادرة", addVariance: "تسجيل انحراف", cancel: "إلغاء", save: "حفظ", code: "الرمز", name: "الاسم", unit: "الوحدة", target: "القيمة المستهدفة",
    periodStart: "بداية الفترة", periodEnd: "نهاية الفترة", assumption: "الافتراض المرتبط", none: "بلا", goal: "الهدف", due: "الاستحقاق", note: "ملاحظة",
    source: "مصدر الفعلي", pipeline: "من الفرص المحسومة", manual: "إدخال يدوي", actual: "القيمة الفعلية", sample: "عدد العناصر التي بُني عليها", recurring: "يتكرر",
    decide: "اتخاذ القرار", decision: "القرار", adjust: "تعديل الافتراض", initiative: "مبادرة لتحسين الأداء", reason: "السبب", conservative: "المتحفظ", base: "الأساسي", optimistic: "المتفائل",
    goalSaved: "حُفظ الهدف.", initiativeSaved: "حُفظت المبادرة.", varianceSaved: "سُجّل الانحراف.", decided: "سُجّل القرار.",
    percent: "نسبة %", sar: "ريال", months: "شهر", days: "يوم", count: "عدد",
  },
  en: {
    addGoal: "Add a goal", addInitiative: "Add an initiative", addVariance: "Record a variance", cancel: "Cancel", save: "Save", code: "Code", name: "Name", unit: "Unit", target: "Target value",
    periodStart: "Period start", periodEnd: "Period end", assumption: "Linked assumption", none: "None", goal: "Goal", due: "Due", note: "Note",
    source: "Actual from", pipeline: "decided opportunities", manual: "entered by hand", actual: "Actual value", sample: "Items it rests on", recurring: "Recurs",
    decide: "Decide", decision: "Decision", adjust: "Adjust the assumption", initiative: "An initiative to improve performance", reason: "Reason", conservative: "Conservative", base: "Base", optimistic: "Optimistic",
    goalSaved: "The goal is saved.", initiativeSaved: "The initiative is saved.", varianceSaved: "The variance is recorded.", decided: "The decision is recorded.",
    percent: "Percent %", sar: "SAR", months: "Months", days: "Days", count: "Count",
  },
  ur: {
    addGoal: "ہدف شامل کریں", addInitiative: "اقدام شامل کریں", addVariance: "فرق درج کریں", cancel: "منسوخ", save: "محفوظ کریں", code: "کوڈ", name: "نام", unit: "اکائی", target: "ہدف کی قدر",
    periodStart: "مدت کا آغاز", periodEnd: "مدت کا اختتام", assumption: "منسلک مفروضہ", none: "کوئی نہیں", goal: "ہدف", due: "مقررہ تاریخ", note: "نوٹ",
    source: "اصل کا ماخذ", pipeline: "طے شدہ مواقع", manual: "ہاتھ سے درج", actual: "اصل قدر", sample: "جن عناصر پر مبنی ہے", recurring: "دہرایا جاتا ہے",
    decide: "فیصلہ کریں", decision: "فیصلہ", adjust: "مفروضہ میں ترمیم", initiative: "کارکردگی بہتر کرنے کا اقدام", reason: "وجہ", conservative: "محتاط", base: "بنیادی", optimistic: "پرامید",
    goalSaved: "ہدف محفوظ ہو گیا۔", initiativeSaved: "اقدام محفوظ ہو گیا۔", varianceSaved: "فرق درج ہو گیا۔", decided: "فیصلہ درج ہو گیا۔",
    percent: "فیصد %", sar: "ریال", months: "ماہ", days: "دن", count: "تعداد",
  },
} satisfies Record<Language, Record<string, string>>;
type Text = (typeof TEXT)["ar"];
const UNITS = ["percent", "sar", "months", "days", "count"] as const;
const NONE = "__none";
type Option = { id: string; code: string; name: string };

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="grid gap-1"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
function Feedback({ error, notice, language }: { error: unknown; notice: string; language: Language }) {
  if (error) return <p role="alert" data-strategy-error className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, language)}</p>;
  return notice ? <p role="status" className="text-sm text-success-soft-foreground">{notice}</p> : null;
}
const pick = (options: Option[], t: Text) => [{ value: NONE, label: t.none }, ...options.map(option => ({ value: option.id, label: `${option.code} · ${option.name}` }))];
const orNull = (value: string) => (value && value !== NONE ? value : null);
const text = (id: string, label: string, value: string, set: (value: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) =>
  <Field id={id} label={label}><Input id={id} className="min-h-11" value={value} onChange={event => set(event.target.value)} {...props} /></Field>;

/** One «add» button that opens its form; the form closes on success and says so. */
function Opener({ label, name, notice, onOpen, children, open }: { label: string; name: string; notice: string; onOpen: () => void; children: React.ReactNode; open: boolean }) {
  if (open) return <>{children}</>;
  return <div className="grid gap-1">{notice ? <p role="status" className="text-sm text-success-soft-foreground">{notice}</p> : null}<Button type="button" variant="outline" className="min-h-11 justify-self-start" data-strategy-open={name} onClick={onOpen}>{label}</Button></div>;
}

export function NewGoal({ tenantId, language, assumptions }: { tenantId: string; language: Language; assumptions: Option[] }) {
  const t = pickLanguage(language, TEXT);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const blank = { code: "", name: "", unit: "percent" as (typeof UNITS)[number], targetValue: "", periodStart: "", periodEnd: "", assumptionId: NONE };
  const [draft, setDraft] = useState(blank);
  const create = trpc.strategy.createGoal.useMutation({ onSuccess: () => { setDraft(blank); setOpen(false); setNotice(t.goalSaved); void utils.strategy.goals.invalidate(); } });
  if (!useCan("strategy.manage")) return null;
  const set = (key: keyof typeof blank) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <Opener label={t.addGoal} name="goal" notice={notice} open={open} onOpen={() => { setNotice(""); create.reset(); setOpen(true); }}>
    <CheckedForm data-strategy-form="goal" className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3" onSubmit={event => {
      event.preventDefault();
      create.mutate({ tenantId, code: draft.code.trim(), name: draft.name.trim(), unit: draft.unit, targetValue: Number(draft.targetValue), periodStart: draft.periodStart, periodEnd: draft.periodEnd, assumptionId: orNull(draft.assumptionId) });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("sg-code", t.code, draft.code, set("code"), { dir: "ltr", required: true, maxLength: 60 })}
        {text("sg-name", t.name, draft.name, set("name"), { required: true, minLength: 2, maxLength: 200 })}
        <Field id="sg-unit" label={t.unit}><Select id="sg-unit" value={draft.unit} onValueChange={set("unit")} options={UNITS.map(unit => ({ value: unit, label: t[unit] }))} /></Field>
        {text("sg-target", t.target, draft.targetValue, set("targetValue"), { type: "number", step: "any", inputMode: "decimal", dir: "ltr", required: true })}
        {text("sg-start", t.periodStart, draft.periodStart, set("periodStart"), { type: "date", dir: "ltr", required: true })}
        {text("sg-end", t.periodEnd, draft.periodEnd, set("periodEnd"), { type: "date", dir: "ltr", required: true })}
        <Field id="sg-assumption" label={t.assumption}><Select id="sg-assumption" value={draft.assumptionId} onValueChange={set("assumptionId")} options={pick(assumptions, t)} /></Field>
      </div>
      <Feedback error={create.error} notice="" language={language} />
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={create.isPending}>{t.save}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </CheckedForm>
  </Opener>;
}

export function NewInitiative({ tenantId, language, goals }: { tenantId: string; language: Language; goals: Option[] }) {
  const t = pickLanguage(language, TEXT);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const blank = { code: "", name: "", goalId: NONE, dueAt: "", note: "" };
  const [draft, setDraft] = useState(blank);
  const create = trpc.strategy.createInitiative.useMutation({ onSuccess: () => { setDraft(blank); setOpen(false); setNotice(t.initiativeSaved); void utils.strategy.initiatives.invalidate(); } });
  if (!useCan("strategy.manage")) return null;
  const set = (key: keyof typeof blank) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <Opener label={t.addInitiative} name="initiative" notice={notice} open={open} onOpen={() => { setNotice(""); create.reset(); setOpen(true); }}>
    <CheckedForm data-strategy-form="initiative" className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3" onSubmit={event => {
      event.preventDefault();
      create.mutate({ tenantId, code: draft.code.trim(), name: draft.name.trim(), goalId: orNull(draft.goalId), dueAt: draft.dueAt || null, note: draft.note.trim() || null });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("si-code", t.code, draft.code, set("code"), { dir: "ltr", required: true, maxLength: 60 })}
        {text("si-name", t.name, draft.name, set("name"), { required: true, minLength: 2, maxLength: 200 })}
        <Field id="si-goal" label={t.goal}><Select id="si-goal" value={draft.goalId} onValueChange={set("goalId")} options={pick(goals, t)} /></Field>
        {text("si-due", t.due, draft.dueAt, set("dueAt"), { type: "date", dir: "ltr" })}
      </div>
      {text("si-note", t.note, draft.note, set("note"), { maxLength: 500 })}
      <Feedback error={create.error} notice="" language={language} />
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={create.isPending}>{t.save}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </CheckedForm>
  </Opener>;
}

/** Record a variance on an approved assumption: the actual is the pipeline's (the server computes it and the count) or typed with its count. */
export function RecordVariance({ tenantId, language, assumptions }: { tenantId: string; language: Language; assumptions: Option[] }) {
  const t = pickLanguage(language, TEXT);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const blank = { assumptionId: assumptions[0]?.id ?? "", periodStart: "", periodEnd: "", source: "pipeline" as "pipeline" | "manual", value: "", sampleSize: "", recurring: false };
  const [draft, setDraft] = useState(blank);
  const record = trpc.strategy.recordVariance.useMutation({ onSuccess: () => { setDraft(blank); setOpen(false); setNotice(t.varianceSaved); void utils.strategy.variances.invalidate(); } });
  if (!useCan("strategy.manage") || !assumptions.length) return null;
  const set = <K extends keyof typeof blank>(key: K) => (value: (typeof blank)[K]) => setDraft(current => ({ ...current, [key]: value }));
  return <Opener label={t.addVariance} name="variance" notice={notice} open={open} onOpen={() => { setNotice(""); record.reset(); setDraft(current => ({ ...current, assumptionId: current.assumptionId || assumptions[0].id })); setOpen(true); }}>
    <CheckedForm data-strategy-form="variance" className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3" onSubmit={event => {
      event.preventDefault();
      const actual = draft.source === "pipeline" ? { source: "pipeline" as const } : { source: "manual" as const, value: Number(draft.value), sampleSize: Number(draft.sampleSize) };
      record.mutate({ tenantId, assumptionId: draft.assumptionId, periodStart: draft.periodStart, periodEnd: draft.periodEnd, recurring: draft.recurring, actual });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="sv-assumption" label={t.assumption}><Select id="sv-assumption" required value={draft.assumptionId} onValueChange={set("assumptionId")} options={assumptions.map(option => ({ value: option.id, label: `${option.code} · ${option.name}` }))} /></Field>
        <Segmented label={t.source} value={draft.source} onValueChange={value => set("source")(value as "pipeline" | "manual")} options={[{ value: "pipeline", label: t.pipeline }, { value: "manual", label: t.manual }]} columns={2} />
        {text("sv-start", t.periodStart, draft.periodStart, set("periodStart"), { type: "date", dir: "ltr", required: true })}
        {text("sv-end", t.periodEnd, draft.periodEnd, set("periodEnd"), { type: "date", dir: "ltr", required: true })}
        {draft.source === "manual" ? <>
          {text("sv-value", t.actual, draft.value, set("value"), { type: "number", step: "any", inputMode: "decimal", dir: "ltr", required: true })}
          {text("sv-sample", t.sample, draft.sampleSize, set("sampleSize"), { type: "number", step: "1", min: 1, inputMode: "numeric", dir: "ltr", required: true })}
        </> : null}
      </div>
      <Checkbox checked={draft.recurring} onCheckedChange={value => set("recurring")(value === true)}>{t.recurring}</Checkbox>
      <Feedback error={record.error} notice="" language={language} />
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={record.isPending}>{t.save}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </CheckedForm>
  </Opener>;
}

/** The decision on an undecided variance: adjust the assumption (new values → a change request another person approves) or an initiative. */
export function DecideVariance({ tenantId, language, varianceId, initiatives }: { tenantId: string; language: Language; varianceId: string; initiatives: Option[] }) {
  const t = pickLanguage(language, TEXT);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ decision: "initiative" as "initiative" | "adjust_assumption", initiativeId: NONE, reason: "", conservative: "", base: "", optimistic: "" });
  const decide = trpc.strategy.decideVariance.useMutation({ onSuccess: () => { setOpen(false); setNotice(t.decided); void utils.strategy.variances.invalidate(); void utils.strategy.assumptions.invalidate(); } });
  if (!useCan("strategy.manage")) return null;
  const set = (key: keyof typeof draft) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  const id = (name: string) => `sd-${varianceId}-${name}`;
  return <Opener label={t.decide} name={`decide-${varianceId}`} notice={notice} open={open} onOpen={() => { setNotice(""); decide.reset(); setOpen(true); }}>
    <CheckedForm data-strategy-form="decide" className="grid gap-3" onSubmit={event => {
      event.preventDefault();
      decide.mutate(draft.decision === "adjust_assumption"
        ? { tenantId, varianceId, decision: "adjust_assumption", reason: draft.reason.trim(), values: { conservative: Number(draft.conservative), base: Number(draft.base), optimistic: Number(draft.optimistic) } }
        : { tenantId, varianceId, decision: "initiative", reason: draft.reason.trim(), ...(orNull(draft.initiativeId) ? { initiativeId: draft.initiativeId } : {}) });
    }}>
      <Segmented label={t.decision} value={draft.decision} onValueChange={set("decision")} options={[{ value: "initiative", label: t.initiative }, { value: "adjust_assumption", label: t.adjust }]} columns={2} />
      {draft.decision === "adjust_assumption"
        ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{(["conservative", "base", "optimistic"] as const).map(key => text(id(key), t[key], draft[key], set(key), { type: "number", step: "any", inputMode: "decimal", dir: "ltr", required: true }))}</div>
        : <Field id={id("initiative")} label={t.initiative}><Select id={id("initiative")} value={draft.initiativeId} onValueChange={set("initiativeId")} options={pick(initiatives, t)} /></Field>}
      <Field id={id("reason")} label={t.reason}><Textarea id={id("reason")} required minLength={2} maxLength={500} value={draft.reason} onChange={event => set("reason")(event.target.value)} /></Field>
      <Feedback error={decide.error} notice="" language={language} />
      <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={decide.isPending}>{t.save}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </CheckedForm>
  </Opener>;
}
