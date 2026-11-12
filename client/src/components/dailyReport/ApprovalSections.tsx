// Q-9 / D-45 (c) on the screen: section 4 (the day's inspections, read from the WIRs and RFIs of that day on site, never typed), section 10 (the chain prepare →
// review → approve, who holds each step and who did it when, and the review step's pass / return for the person who holds it), and the place of a photo (a zone
// in words, or a unit of the same project). Every figure here is the server's; nothing is counted in the browser.
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

type Tally = { submitted: number; approved: number; rejected: number; pending: number };
type WirItem = { id: string; code: string; state: string };
type RfiItem = { id: string; number: string; state: string };
export type Inspections = { wir: Tally & { items: WirItem[] }; rfi: Tally & { items: RfiItem[] } };
type Step = { holder: number | null; by: number | null; at: Date | string | null; note?: string | null };
export type Approval = { prepare: Step; review: Step; approve: Step };

const text = {
  ar: {
    saveFirst: "احفظ التقرير لترى فحوصات يومه.", wir: "طلبات الفحص (WIR)", rfi: "طلبات المعلومات (RFI)",
    submitted: "مقدَّم", approved: "معتمد", rejected: "مرفوض", pending: "معلّق", none: "لا شيء في هذا اليوم.", readOnly: "تُقرأ من سجلات اليوم ولا تُكتب هنا.",
    steps: { prepare: "أعدّه", review: "راجعه", approve: "اعتمده" }, holder: "المسؤول", unassigned: "غير مُسنَد (يقوم به من يملك الصلاحية)", done: "تم", waiting: "لم يتم بعد", you: "أنت",
    pass: "اجتاز المراجعة", back: "أعِده لكاتبه", note: "ملاحظة المراجعة (إلزامية عند الإعادة)", passed: "اجتاز المراجعة، وينتظر الاعتماد.", returned: "أُعيد التقرير لكاتبه.",
    zone: "المنطقة (اختياري)", unit: "رقم الوحدة (اختياري)", noUnit: "لا وحدة بهذا الرقم", where: (zone: string | null, unit: string | null) => [zone, unit ? `وحدة ${unit}` : null].filter(Boolean).join(" · "),
  },
  en: {
    saveFirst: "Save the report to see its day's inspections.", wir: "Inspection requests (WIR)", rfi: "Requests for information (RFI)",
    submitted: "Submitted", approved: "Approved", rejected: "Rejected", pending: "Pending", none: "Nothing on this day.", readOnly: "Read from the day's records; not typed here.",
    steps: { prepare: "Prepared by", review: "Reviewed by", approve: "Approved by" }, holder: "Holder", unassigned: "Not assigned (anyone with the permission)", done: "Done", waiting: "Not yet", you: "You",
    pass: "Passes review", back: "Send back to its writer", note: "Review note (required to send back)", passed: "Passed review; waiting for approval.", returned: "The report was sent back to its writer.",
    zone: "Zone (optional)", unit: "Unit number (optional)", noUnit: "No unit with that number", where: (zone: string | null, unit: string | null) => [zone, unit ? `Unit ${unit}` : null].filter(Boolean).join(" · "),
  },
  ur: {
    saveFirst: "اس دن کے معائنے دیکھنے کے لیے رپورٹ محفوظ کریں۔", wir: "معائنے کی درخواستیں (WIR)", rfi: "معلومات کی درخواستیں (RFI)",
    submitted: "پیش کردہ", approved: "منظور", rejected: "مسترد", pending: "زیر التوا", none: "اس دن کچھ نہیں۔", readOnly: "دن کے ریکارڈ سے پڑھے جاتے ہیں؛ یہاں لکھے نہیں جاتے۔",
    steps: { prepare: "تیار کنندہ", review: "جائزہ کنندہ", approve: "منظور کنندہ" }, holder: "ذمہ دار", unassigned: "مقرر نہیں (اجازت رکھنے والا کوئی بھی)", done: "مکمل", waiting: "ابھی نہیں", you: "آپ",
    pass: "جائزے میں کامیاب", back: "لکھنے والے کو واپس بھیجیں", note: "جائزے کا نوٹ (واپس بھیجنے کے لیے لازمی)", passed: "جائزے میں کامیاب؛ منظوری کا انتظار۔", returned: "رپورٹ لکھنے والے کو واپس بھیج دی گئی۔",
    zone: "علاقہ (اختیاری)", unit: "یونٹ نمبر (اختیاری)", noUnit: "اس نمبر کا کوئی یونٹ نہیں", where: (zone: string | null, unit: string | null) => [zone, unit ? `یونٹ ${unit}` : null].filter(Boolean).join(" · "),
  },
};
// the server sends a Date (superjson); a test or an older cache may hold the ISO text. Either way the day on site (UTC+3) is shown.
const dayOf = (value: Date | string) => new Date(new Date(value).getTime() + 3 * 3600e3).toISOString().slice(0, 10);
const useText = () => pickLanguage(useLanguage().language, text);

function TallyCard({ title, tally, items }: { title: string; tally: Tally; items: Array<{ id: string; label: string; state: string }> }) {
  const t = useText();
  const stateName = (state: string) => ({ approved: t.approved, rejected: t.rejected, pending: t.pending } as Record<string, string>)[state] ?? state;
  return (
    <div className="space-y-2 rounded-lg border p-3" data-inspections={title}>
      <p className="text-sm font-semibold">{title}</p>
      <dl className="grid grid-cols-4 gap-1 text-center text-xs">
        {(["submitted", "approved", "rejected", "pending"] as const).map(key => (
          <div key={key} className="rounded-md bg-muted p-1"><dt className="text-muted-foreground">{t[key]}</dt><dd className="text-base font-semibold" data-count={key}>{tally[key]}</dd></div>
        ))}
      </dl>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">{t.none}</p> : (
        <ul className="divide-y text-sm">{items.map(item => <li key={item.id} className="flex justify-between py-1"><span dir="ltr">{item.label}</span><span className="text-muted-foreground">{stateName(item.state)}</span></li>)}</ul>
      )}
    </div>
  );
}

/** Section 4: what the day's WIRs and RFIs say, by state. A report not saved yet has no day on the server to read. */
export function InspectionsSection({ inspections }: { inspections: Inspections | undefined }) {
  const t = useText();
  if (!inspections) return <p className="text-sm text-muted-foreground">{t.saveFirst}</p>;
  return (
    <>
      <p className="text-xs text-muted-foreground">{t.readOnly}</p>
      <TallyCard title={t.wir} tally={inspections.wir} items={inspections.wir.items.map(item => ({ id: item.id, label: item.code, state: item.state }))} />
      <TallyCard title={t.rfi} tally={inspections.rfi} items={inspections.rfi.items.map(item => ({ id: item.id, label: item.number, state: item.state }))} />
    </>
  );
}

/** Section 10: the three steps as they stand, and the review step for the person who holds it while the report waits for it. */
export function ApprovalChain({ scope, reportId, status, approval, onChanged }: { scope: { tenantId: string; projectId: string }; reportId: string | null; status: string | null; approval: Approval | undefined; onChanged: () => void }) {
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const me = trpc.auth.me.useQuery(undefined, { enabled: Boolean(reportId) });
  const names = trpc.projects.approvers.get.useQuery(scope, { enabled: Boolean(reportId) });
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const check = trpc.siteReports.check.useMutation({ onSuccess: (_result, variables) => { setDone(variables.decision === "pass" ? t.passed : t.returned); setNote(""); onChanged(); } });
  if (!reportId || !approval) return null;
  const myId = me.data?.id ?? null;
  const who = (userId: number | null, step: "prepare" | "review" | "approve") => {
    if (userId === null) return null;
    if (userId === myId) return t.you;
    const named = (names.data as Record<string, { userId: number; name: string | null } | null> | undefined)?.[step];
    return named && named.userId === userId ? named.name ?? "—" : "—";
  };
  const reviewIsMine = status === "submitted" && approval.review.holder !== null && approval.review.holder === myId && !approval.review.at;
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {(["prepare", "review", "approve"] as const).map(step => {
          const row = approval[step];
          return (
            <li key={step} className="rounded-lg border p-2 text-sm" data-chain-step={step}>
              <p className="font-semibold">{t.steps[step]}</p>
              <p><span className="text-muted-foreground">{t.holder}: </span>{row.holder === null ? t.unassigned : who(row.holder, step)}</p>
              <p data-step-state={row.at ? "done" : "waiting"}>{row.at ? `${t.done}: ${who(row.by, step) ?? "—"} · ${showDate(dayOf(row.at), language)}` : t.waiting}</p>
              {row.note ? <p className="text-muted-foreground">{row.note}</p> : null}
            </li>
          );
        })}
      </ol>
      {reviewIsMine && (
        <div className="space-y-2 rounded-lg bg-muted p-3" data-review-step>
          <label className="block text-sm font-medium">{t.note}<input className={`${fieldInput} mt-1`} value={note} onChange={event => setNote(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className={tap} disabled={check.isPending} onClick={() => check.mutate({ ...scope, reportId, decision: "pass", note: note.trim() || undefined })}>{t.pass}</Button>
            <Button type="button" variant="outline" className={tap} disabled={check.isPending || !note.trim()} onClick={() => check.mutate({ ...scope, reportId, decision: "return", note: note.trim() })}>{t.back}</Button>
          </div>
        </div>
      )}
      {check.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(check.error, isArabic)}</p>}
      {done && <p role="status" className="text-sm text-success-soft-foreground">{done}</p>}
    </div>
  );
}

/** Where a photo was taken: a zone in words and/or a unit number of this project (the server refuses a unit of another project). */
export function PhotoPlace({ zone, unitNumber, onZone, onUnit, unitKnown }: { zone: string; unitNumber: string; onZone: (value: string) => void; onUnit: (value: string) => void; unitKnown: boolean }) {
  const t = useText();
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-sm font-medium">{t.zone}<input className={`${fieldInput} mt-1`} maxLength={80} value={zone} onChange={event => onZone(event.target.value)} /></label>
      <label className="block text-sm font-medium">{t.unit}<input className={`${fieldInput} mt-1`} type="number" inputMode="numeric" min="1" step="1" value={unitNumber} onChange={event => onUnit(event.target.value)} /></label>
      {unitNumber.trim() && !unitKnown ? <p role="alert" className="col-span-2 text-sm text-danger-soft-foreground">{t.noUnit}</p> : null}
    </div>
  );
}

export function photoPlaceText(language: "ar" | "en" | "ur", zone: string | null, unit: string | null) {
  return text[language].where(zone, unit);
}
