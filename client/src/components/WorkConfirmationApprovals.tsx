import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck } from "lucide-react";
import React, { useState } from "react";

// Q-43 batch 4c (docs/proposals/subcontractor-progress.md §6): the approver's list of subcontractor work confirmations. Each sent confirmation shows its lines
// with what the subcontract already has approved for the same cell and the server's warnings (site cell not COMPLETE, QC not received — a warning, never a
// block, decision 5), and «Approve» / «Reject with a reason». No price anywhere: the confirmation says what was done. Every rule is the server's (separation of
// duties: nobody approves what they prepared; a rejection needs its reason); its refusal is shown in the person's language.
const tap = "min-h-[44px]";

const text = {
  ar: {
    title: "إثباتات أعمال المقاولين", hint: "الإثباتات المرسلة للاعتماد، مع ما اعتُمد سابقًا لكل خلية وتحذيرات الموقع والجودة. لا أسعار هنا: المستخلص يحسب الثمن.",
    pending: "بانتظار الاعتماد", none: "لا إثبات بانتظار الاعتماد.", decided: "قرارات سابقة", approve: "اعتماد", reject: "رفض", reason: "سبب الرفض", confirmReject: "تأكيد الرفض", cancel: "إلغاء",
    reasonShort: "اكتب سببًا من ثلاثة أحرف على الأقل.", previous: "اعتُمد سابقًا", villa: "فيلا", siteNotComplete: "الموقع لم يكتمل", qcNotReceived: "لم تستلمه الجودة", historical: "تاريخي", correction: "تصحيح",
    status: { draft: "مسودة", submitted: "مرسل", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" } as Record<string, string>, approved: "اعتُمد الإثبات", rejected: "رُفض الإثبات", loading: "جارٍ التحميل…",
  },
  en: {
    title: "Subcontractor work confirmations", hint: "Confirmations sent for approval, with what each cell already has approved and the site and QC warnings. No prices here: the certificate prices the work.",
    pending: "Awaiting approval", none: "No confirmation is awaiting approval.", decided: "Earlier decisions", approve: "Approve", reject: "Reject", reason: "Reason for rejecting", confirmReject: "Confirm the rejection", cancel: "Cancel",
    reasonShort: "Enter a reason of at least three characters.", previous: "Approved before", villa: "Villa", siteNotComplete: "Site not complete", qcNotReceived: "Not received by QC", historical: "Historical", correction: "Correction",
    status: { draft: "Draft", submitted: "Sent", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as Record<string, string>, approved: "The confirmation was approved", rejected: "The confirmation was rejected", loading: "Loading…",
  },
  ur: {
    title: "ذیلی ٹھیکیداروں کے کام کی تصدیقات", hint: "منظوری کے لیے بھیجی گئی تصدیقات، ہر خانے کی پہلے سے منظور شدہ مقدار اور سائٹ و QC کی تنبیہات کے ساتھ۔ یہاں کوئی قیمت نہیں: بل قیمت لگاتا ہے۔",
    pending: "منظوری کا انتظار", none: "کوئی تصدیق منظوری کے انتظار میں نہیں۔", decided: "پچھلے فیصلے", approve: "منظور کریں", reject: "مسترد کریں", reason: "مسترد کرنے کی وجہ", confirmReject: "مسترد کرنے کی تصدیق", cancel: "منسوخ",
    reasonShort: "کم از کم تین حروف کی وجہ لکھیں۔", previous: "پہلے منظور شدہ", villa: "ولا", siteNotComplete: "سائٹ مکمل نہیں", qcNotReceived: "QC نے وصول نہیں کیا", historical: "تاریخی", correction: "تصحیح",
    status: { draft: "مسودہ", submitted: "بھیجی گئی", approved: "منظور شدہ", rejected: "مسترد", cancelled: "منسوخ" } as Record<string, string>, approved: "تصدیق منظور ہو گئی", rejected: "تصدیق مسترد ہو گئی", loading: "لوڈ ہو رہا ہے…",
  },
};

type Confirmation = { id: string; number: string; subcontractorName: string; subcontractCode: string; periodStart: string; periodEnd: string; status: string; note: string | null; rejectionReason: string | null;
  lines: Array<{ id: string; kind: string; percent: number | null; quantity: number | null; unitNumber: number | null; activityCode: string | null; activityName: string | null; boqCode: string | null; unitOfMeasure: string | null; historical: boolean; correctsLineId: string | null; previousApproved: number; warnings: string[] }> };

export function WorkConfirmationApprovals({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canApprove = useCan("project.commitment.manage", projectId);
  const utils = trpc.useUtils();
  const list = trpc.workConfirmations.list.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonShort, setReasonShort] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const transition = trpc.workConfirmations.transition.useMutation({ onSuccess: (_result, input) => { setDone(input.nextStatus === "approved" ? t.approved : t.rejected); setRejecting(null); setReason(""); return utils.workConfirmations.list.invalidate(); } });
  const rows = (list.data ?? []) as Confirmation[];
  const pending = rows.filter(row => row.status === "submitted");
  const decided = rows.filter(row => row.status === "approved" || row.status === "rejected").slice(0, 10);
  const lineLabel = (line: Confirmation["lines"][number]) => (line.kind === "unit" ? `${t.villa} ${line.unitNumber} · ${line.activityCode} — ${line.activityName}` : `${line.boqCode}`);
  const valueOf = (line: Confirmation["lines"][number], value: number | null) => (line.kind === "unit" ? `${value ?? 0}%` : `${value ?? 0} ${line.unitOfMeasure ?? ""}`.trim());
  const reject = (id: string) => {
    if (reason.trim().length < 3) { setReasonShort(true); return; }
    setReasonShort(false);
    transition.mutate({ tenantId, projectId, confirmationId: id, nextStatus: "rejected", reason: reason.trim() });
  };
  const card = (row: Confirmation, actions: boolean) => (
    <li key={row.id} className="space-y-2 rounded-xl border p-3 text-sm" data-testid="work-confirmation-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold"><bdi>{row.number}</bdi> · {row.subcontractCode} — {row.subcontractorName}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t.status[row.status] ?? row.status}</span>
      </div>
      <p className="text-xs text-muted-foreground"><bdi>{row.periodStart}</bdi> – <bdi>{row.periodEnd}</bdi>{row.note ? ` · ${row.note}` : ""}</p>
      {row.rejectionReason && <p className="text-xs text-danger-soft-foreground">{t.reason}: {row.rejectionReason}</p>}
      <ul className="divide-y rounded-lg border">
        {row.lines.map(line => (
          <li key={line.id} className="flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:justify-between">
            <span><bdi>{lineLabel(line)}</bdi>{line.historical && <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t.historical}</span>}{line.correctsLineId && <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t.correction}</span>}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium"><bdi>{valueOf(line, line.kind === "unit" ? line.percent : line.quantity)}</bdi></span>
              <span className="text-xs text-muted-foreground">{t.previous}: <bdi>{valueOf(line, line.previousApproved)}</bdi></span>
              {line.warnings.includes("SITE_NOT_COMPLETE") && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground" data-warning="site">{t.siteNotComplete}</span>}
              {line.warnings.includes("QC_NOT_RECEIVED") && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground" data-warning="qc">{t.qcNotReceived}</span>}
            </span>
          </li>
        ))}
      </ul>
      {actions && canApprove && (rejecting === row.id ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium">{t.reason}<Input className={`mt-1 ${tap}`} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
          {reasonShort && <p role="alert" className="text-sm text-danger-soft-foreground">{t.reasonShort}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className={tap} disabled={transition.isPending} onClick={() => reject(row.id)}>{t.confirmReject}</Button>
            <Button type="button" variant="outline" className={tap} onClick={() => { setRejecting(null); setReason(""); setReasonShort(false); }}>{t.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" className={tap} disabled={transition.isPending} onClick={() => { setDone(null); transition.mutate({ tenantId, projectId, confirmationId: row.id, nextStatus: "approved" }); }}>{t.approve}</Button>
          <Button type="button" variant="outline" className={tap} onClick={() => { setDone(null); transition.reset(); setRejecting(row.id); }}>{t.reject}</Button>
        </div>
      ))}
    </li>
  );
  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border" aria-label={t.title} data-testid="work-confirmation-approvals">
      <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-5 w-5 text-primary" aria-hidden /><div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t.hint}</p></div></div>
      {list.isLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">{t.loading}</p>}
      {list.error && <p role="alert" className="mt-3 text-sm text-danger-soft-foreground">{getLocalizedProjectError(list.error, language)}</p>}
      {done && <p role="status" className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">{done}</p>}
      {transition.error && <p role="alert" className="mt-3 text-sm text-danger-soft-foreground">{getLocalizedProjectError(transition.error, language)}</p>}
      {list.data && <>
        <h3 className="mt-4 text-sm font-semibold">{t.pending}</h3>
        {pending.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t.none}</p> : <ul className="mt-2 space-y-3">{pending.map(row => card(row, true))}</ul>}
        {decided.length > 0 && <><h3 className="mt-4 text-sm font-semibold">{t.decided}</h3><ul className="mt-2 space-y-3">{decided.map(row => card(row, false))}</ul></>}
      </>}
    </section>
  );
}
