import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds";
/** «all activities» on the ds list (which has no empty value); the address carries no activity then. */
const ALL_ACTIVITIES = "__all";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";

// The card of a unit — or of one of its activities — with ONE timeline (work order 14, item 1): what the site reported, what was sent to the consultant, the inspections and
// their answers, the NCRs, the material issued into it and every change of its status, newest first. It shows no money: a material line says what and how much. The card does
// not decide anything; it shows the answer of the same functions the server and the database use (is the activity accepted, is an NCR holding it).
const text = {
  ar: {
    title: "بطاقة الوحدة", back: "العودة إلى الإدخال السريع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", unitUnknown: "لا وحدة بهذا الرقم في هذا المشروع.", unitLabel: "الوحدة", zone: "المنطقة", block: "البلوك", model: "النموذج",
    activity: "النشاط", allActivities: "كل الأنشطة (سجل الوحدة)", status: "الحالة", openNcrs: "NCR مفتوحة", quality: "الجودة",
    qcReceipt: "استلام QC", qcReceived: "مستلم", qcNotReceived: "غير مستلم", qcNone: "لم يُسجَّل بعد", stalled: "متوقفة", longStalled: "متوقفة طويلًا", workingDays: "أيام عمل بلا حركة", nextActivity: "البند التالي", accepted: "فحص مقبول", notAccepted: "لا فحص مقبول", heldByNcr: "الفحص مقبول لكن NCR مفتوح يمنع احتسابه", policy: "قاعدة الإكمال", ncrRule: "قاعدة NCR",
    modeoff: "معطّلة", modewarn: "تحذير", modeblock: "منع",
    NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل",
    timeline: "الخط الزمني", empty: "لا أحداث بعد لهذه الوحدة.", filter: "النوع", all: "الكل",
    daily_report: "تقرير يومي", submittal: "تسليم للاستشاري", inspection: "فحص", ncr: "عدم مطابقة", material_issue: "مادة مصروفة", status_change: "تغيّر حالة",
    quantity: "الكمية", reply: "الرد", noReply: "بلا رد", answer: "الرد", consultant: "الاستشاري", noAnswer: "بلا رد بعد", state: "الحالة", more: "المزيد", showAll: "عرض أقدم", label: "البند",
  },
  en: {
    title: "Unit card", back: "Back to quick entry", loading: "Loading…", retry: "Retry", unitUnknown: "No unit with that number in this project.", unitLabel: "Unit", zone: "Zone", block: "Block", model: "Model",
    activity: "Activity", allActivities: "All activities (the unit's record)", status: "Status", openNcrs: "Open NCRs", quality: "Quality",
    qcReceipt: "QC receipt", qcReceived: "Received", qcNotReceived: "Not received", qcNone: "Not recorded yet", stalled: "Stalled", longStalled: "Long stalled", workingDays: "working days without movement", nextActivity: "Next activity", accepted: "Inspection accepted", notAccepted: "No accepted inspection", heldByNcr: "The inspection is accepted, but an open NCR keeps it from counting", policy: "Completion rule", ncrRule: "NCR rule",
    modeoff: "Off", modewarn: "Warn", modeblock: "Block",
    NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete",
    timeline: "Timeline", empty: "No events yet for this unit.", filter: "Kind", all: "All",
    daily_report: "Daily report", submittal: "Consultant submittal", inspection: "Inspection", ncr: "NCR", material_issue: "Material issued", status_change: "Status change",
    quantity: "Quantity", reply: "Reply", noReply: "No reply", answer: "Answer", consultant: "Consultant", noAnswer: "No answer yet", state: "Status", more: "More", showAll: "Show older", label: "Item",
  },
  ur: {
    title: "یونٹ کارڈ", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش", unitUnknown: "اس پروجیکٹ میں اس نمبر کا کوئی یونٹ نہیں۔", unitLabel: "یونٹ", zone: "زون", block: "بلاک", model: "ماڈل",
    activity: "سرگرمی", allActivities: "تمام سرگرمیاں (یونٹ کا ریکارڈ)", status: "حالت", openNcrs: "کھلے NCR", quality: "معیار",
    qcReceipt: "کیو سی وصولی", qcReceived: "وصول شدہ", qcNotReceived: "وصول نہیں ہوا", qcNone: "ابھی درج نہیں", stalled: "رکی ہوئی", longStalled: "طویل عرصے سے رکی ہوئی", workingDays: "کام کے دن بغیر حرکت", nextActivity: "اگلی سرگرمی", accepted: "معائنہ قبول شدہ", notAccepted: "کوئی قبول شدہ معائنہ نہیں", heldByNcr: "معائنہ قبول ہے، مگر کھلا NCR اسے شمار ہونے سے روکتا ہے", policy: "تکمیل کا قاعدہ", ncrRule: "NCR کا قاعدہ",
    modeoff: "بند", modewarn: "تنبیہ", modeblock: "روک",
    NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیرِ جائزہ", COMPLETE: "مکمل",
    timeline: "ٹائم لائن", empty: "اس یونٹ کے لیے ابھی کوئی واقعہ نہیں۔", filter: "قسم", all: "سب",
    daily_report: "روزانہ رپورٹ", submittal: "کنسلٹنٹ کو سبمٹل", inspection: "معائنہ", ncr: "عدم مطابقت", material_issue: "مادّہ جاری", status_change: "حالت میں تبدیلی",
    quantity: "مقدار", reply: "جواب", noReply: "جواب نہیں", answer: "جواب", consultant: "کنسلٹنٹ", noAnswer: "ابھی جواب نہیں", state: "حالت", more: "مزید", showAll: "پرانے دکھائیں", label: "آئٹم",
  },
};

const KINDS = ["daily_report", "submittal", "inspection", "ncr", "material_issue", "status_change"] as const;
const PAGE = 25;
const SEPARATOR = " · ";

export default function UnitCard() {
  const { tenantId = "", projectId = "", unitNumber = "" } = useParams<{ tenantId: string; projectId: string; unitNumber: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const options = trpc.siteReports.options.useQuery(scope, { enabled });
  const unit = options.data?.units.find(item => String(item.number) === unitNumber);
  const activities = (options.data?.activities ?? []).filter(item => item.modelCode === unit?.modelCode);
  const requested = new URLSearchParams(search).get("activity");
  const activity = activities.find(item => item.code === requested);
  // Q-5: the villa's QC receipt beside its site status (pmc_qc_receipts, apart from the progress); a failed reading only hides the line
  const states = trpc.pmc.villaStates.useQuery({ ...scope, villa: unitNumber }, { enabled: enabled && Boolean(unitNumber) });
  // Q-14: a stalled villa says so on its card (working days since its last movement); a failed reading only hides the line
  const stall = trpc.pmc.stalledUnits.useQuery(scope, { enabled, staleTime: 60_000 });
  const stallRow = stall.isError ? undefined : stall.data?.rows.find(row => row.villa === String(Number(unitNumber)) && row.state !== "active");
  const card = trpc.cells.card.useQuery({ ...scope, unitId: unit?.id ?? "", activityDefinitionId: activity?.id }, { enabled: enabled && Boolean(unit) });
  const [kind, setKind] = useState<(typeof KINDS)[number] | "all">("all");
  const [shownCount, setShownCount] = useState(PAGE);
  const back = `/m/${tenantId}/${projectId}`;
  const shell = (children: React.ReactNode) => <FieldShell wide tenantId={tenantId} projectId={projectId} title={`${t.title} ${unitNumber}`} backHref={back} backLabel={t.back}>{children}</FieldShell>;

  if (options.isLoading || (unit && card.isLoading)) return shell(<p role="status" className="text-sm text-slate-500">{t.loading}</p>);
  const failure = options.error ?? card.error;
  if (failure) return shell(<><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(failure, isArabic)}</p><Button className={tap} variant="outline" onClick={() => { void options.refetch(); void card.refetch(); }}>{t.retry}</Button></>);
  if (!unit) return shell(<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.unitUnknown}</p>);
  const data = card.data;
  if (!data) return shell(<p role="status" className="text-sm text-slate-500">{t.loading}</p>);

  const name = (key: string) => (t as Record<string, string>)[key] ?? key;
  // a status change is recorded as codes (FROM → TO); the person reads them in their language
  const eventTitle = (event: (typeof data.events)[number]) => (event.kind === "status_change" ? event.title.split(" → ").map(code => (t as Record<string, string>)[code] ?? code).join(" → ") : event.title);
  const detail = (event: (typeof data.events)[number]) => {
    const d = event.detail as Record<string, string | number | null>;
    switch (event.kind) {
      case "daily_report": return [d.label, d.description, d.quantity !== null && d.quantity !== undefined ? `${t.quantity}: ${d.quantity}` : null, d.reportedStatus ? name(String(d.reportedStatus)) : null].filter(Boolean).join(SEPARATOR);
      case "submittal": return [name("state") + ": " + d.status, d.replyCode ? `${t.reply}: ${d.replyCode}` : t.noReply, d.submittalType].filter(Boolean).join(SEPARATOR);
      case "inspection": return [d.responseCode ? `${t.answer}: ${d.responseCode}` : t.noAnswer, d.consultant ? `${t.consultant}: ${d.consultant}` : null].filter(Boolean).join(SEPARATOR);
      case "ncr": return [d.status, d.summary].filter(Boolean).join(SEPARATOR);
      case "material_issue": return [d.description, `${t.quantity}: ${d.quantity} ${d.unit ?? ""}`.trim()].filter(Boolean).join(SEPARATOR);
      default: return d.note ? String(d.note) : "";
    }
  };
  const events = data.events.filter(event => kind === "all" || event.kind === kind);

  return shell(
    <>
      {stallRow && <p role="status" data-stall-badge className="rounded-xl border border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">{stallRow.state === "long" ? t.longStalled : t.stalled}: <bdi dir="ltr">{stallRow.workingDays}</bdi> {t.workingDays}{stallRow.nextActivity ? <> · {t.nextActivity}: {stallRow.nextActivity.name}</> : null}</p>}
      <section aria-label={t.unitLabel} className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-4">
        <p><span className="block text-xs text-slate-600">{t.unitLabel}</span><b className="text-lg">{data.unit.number}</b></p>
        <p><span className="block text-xs text-slate-600">{t.zone} / {t.block}</span><b>{data.unit.zone} / {data.unit.block}</b></p>
        <p><span className="block text-xs text-slate-600">{t.model}</span><b>{data.unit.modelCode}</b></p>
        <p><span className="block text-xs text-slate-600">{t.openNcrs}</span><b className={data.openNcrs > 0 ? "text-red-700" : ""}>{data.openNcrs}</b></p>
        <label className="block text-sm font-medium sm:col-span-4">{t.activity}
          <Select className="mt-1" aria-label={t.allActivities} value={activity?.code ?? ALL_ACTIVITIES} onValueChange={value => { setShownCount(PAGE); navigate(`${back}/unit/${encodeURIComponent(unitNumber)}${value !== ALL_ACTIVITIES ? `?activity=${encodeURIComponent(value)}` : ""}`); }} options={[{ value: ALL_ACTIVITIES, label: t.allActivities }, ...activities.map(item => ({ value: item.code, label: `${item.code} — ${item.name}` }))]} /></label>
        {data.activity && (
          <div className="space-y-1 sm:col-span-4" data-cell-status>
            <p className="text-sm"><b>{t.status}:</b> {name(data.status ?? "NOT_STARTED")}</p>
            {!states.isError && (() => { const qc = states.data?.activities.find(item => item.code === data.activity?.code); return <p className="text-sm" data-qc-receipt><b>{t.qcReceipt}:</b> {qc?.qcReceived === true ? t.qcReceived : qc?.qcReceived === false ? t.qcNotReceived : t.qcNone}{qc?.qcOn ? <> · <bdi dir="ltr">{qc.qcOn}</bdi></> : null}</p>; })()}
            {data.qc && <>
              <p className={`text-sm font-semibold ${data.qc.accepted ? "text-emerald-700" : "text-red-700"}`}>{t.quality}: {data.qc.accepted ? t.accepted : t.notAccepted} <span className="font-normal text-slate-600">({t.policy}: {name("mode" + data.qc.policy)} · {t.ncrRule}: {name("mode" + data.qc.ncrMode)})</span></p>
              {data.qc.heldByNcr && <p role="note" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t.heldByNcr}</p>}
            </>}
          </div>
        )}
      </section>

      <section aria-label={t.timeline} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{t.timeline}</h2>
          <label className="flex items-center gap-2 text-sm font-medium">{t.filter}<Select aria-label={t.all} value={kind} onValueChange={value => { setKind(value as typeof kind); setShownCount(PAGE); }} options={[{ value: "all", label: t.all }, ...KINDS.map(value => ({ value, label: name(value) }))]} /></label></div>
        {events.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.empty}</p>
          : <ol className="space-y-2">{events.slice(0, shownCount).map(event => (
            <li key={`${event.kind}-${event.ref}-${event.at}`} className="rounded-xl border bg-white p-3" data-kind={event.kind}>
              <p className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-semibold">{name(event.kind)} · <bdi>{eventTitle(event)}</bdi></span><span className="text-xs text-slate-600">{showDate(event.at, language)}</span></p>
              {detail(event) && <p className="text-sm text-slate-700"><bdi>{detail(event)}</bdi></p>}
            </li>))}</ol>}
        {events.length > shownCount && <Button variant="outline" className={`${tap} w-full`} onClick={() => setShownCount(count => count + PAGE)}>{t.showAll}</Button>}
      </section>
    </>,
  );
}
