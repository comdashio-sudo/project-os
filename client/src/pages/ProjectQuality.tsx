import { Button } from "@/components/ui/button";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan, WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { useParams } from "wouter";

// Quality (work order 14, item 1): the inspection requests of a project — who asked, for which units and activity, where each one stands on its five steps, how long it has
// waited, what the consultant answered — and the non-conformance reports (NCR) with their closure. Two company rules are shown beside them, because they decide what an
// answer is worth: which codes count as an acceptance, and whether an open NCR holds an acceptance back.
const text = {
  ar: {
    title: "الجودة", back: "العودة إلى الإدخال السريع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    tabInspections: "طلبات الفحص", tabNcrs: "عدم المطابقة (NCR)", tabRules: "قواعد الشركة",
    unit: "الوحدات", activity: "النشاط", consultant: "الاستشاري", contractor: "المقاول", requestedAt: "تاريخ الطلب", age: "عمر الطلب", days: "يوم", step: "الخطوة", answer: "الرد", none: "—",
    filter: "عرض", all: "الكل", awaiting: "بانتظار الرد", answered: "مُجاب عنه", accepted: "مقبول", notAccepted: "غير مقبول",
    acceptedBadge: "مقبول", notAcceptedBadge: "غير مقبول", holdNote: "الرد مقبول لكن NCR مفتوح يمنع احتسابه", openNcrFor: "NCR مفتوح",
    CONFIGURATIONS: "إعداد الطلب", MANAGER_APPROVAL: "اعتماد المدير", TECHNICAL_ASSISTANT: "المساعد الفني", WAITING_CONSULTANT: "بانتظار الاستشاري", RESULT_RECEIVING: "استلام النتيجة",
    advance: "إتمام هذه الخطوة", rejectStep: "رفض الخطوة", recordAnswer: "تسجيل رد الاستشاري", noInspections: "لا طلبات فحص بعد.", noMatch: "لا طلب يطابق العرض.",
    newInspection: "طلب فحص جديد", requestCode: "رمز الطلب", unitNumbers: "أرقام الوحدات (مفصولة بفواصل)", pickActivity: "اختر النشاط", create: "إنشاء الطلب", creating: "جارٍ الإنشاء…", created: "أُنشئ الطلب",
    unitsUnknown: "وحدة غير موجودة في المشروع", unitsMixed: "الوحدات من نماذج مختلفة", needUnits: "اكتب رقم وحدة واحدة على الأقل",
    ncrNumber: "رقم NCR", ncrTitle: "العنوان", ncrDescription: "الوصف", ncrDue: "الموعد النهائي", ncrUnit: "رقم الوحدة (اختياري)", ncrActivity: "النشاط (اختياري)", createNcr: "إنشاء NCR", ncrCreated: "أُنشئ NCR",
    open: "مفتوح", under_investigation: "قيد التحقيق", corrective_action: "إجراء تصحيحي", verification: "تحقق", closed: "مغلق", cancelled: "ملغى",
    toNext: "نقل إلى", closeNcr: "إغلاق", cancelNcr: "إلغاء", noNcrs: "لا NCR بعد.", ncrBlocks: "NCR مفتوح على وحدة ونشاط يمنع قبول فحصهما", openCount: "مفتوحة",
    rulesAccepted: "رموز الرد التي تُعدّ قبولًا", rulesCompletion: "لا يكتمل نشاط قبل فحص مقبول", rulesMaterial: "صرف مادة غير معتمدة", rulesNcr: "NCR مفتوح يمنع قبول الفحص",
    off: "معطّل", warn: "تحذير", block: "منع", saveRules: "حفظ القواعد", rulesSaved: "حُفظت القواعد", rulesManager: "تعديل القواعد لمدير الشركة وحده.",
    responseA: "A — معتمد", responseB: "B — معتمد بملاحظات", responseC: "C — يُعدَّل ويُعاد", responseUR: "UR — قيد المراجعة",
    noPermission: "دورك لا يتيح تعديل الجودة.", warningNcr: "سُجّل الرد، لكن NCR مفتوح على هذه الخلية:",
  },
  en: {
    title: "Quality", back: "Back to quick entry", loading: "Loading…", retry: "Retry",
    tabInspections: "Inspection requests", tabNcrs: "Non-conformances (NCR)", tabRules: "Company rules",
    unit: "Units", activity: "Activity", consultant: "Consultant", contractor: "Contractor", requestedAt: "Requested", age: "Age of the request", days: "d", step: "Step", answer: "Answer", none: "—",
    filter: "Show", all: "All", awaiting: "Awaiting an answer", answered: "Answered", accepted: "Accepted", notAccepted: "Not accepted",
    acceptedBadge: "Accepted", notAcceptedBadge: "Not accepted", holdNote: "The answer is an acceptance, but an open NCR keeps it from counting", openNcrFor: "Open NCR",
    CONFIGURATIONS: "Request set-up", MANAGER_APPROVAL: "Manager approval", TECHNICAL_ASSISTANT: "Technical assistant", WAITING_CONSULTANT: "Waiting for the consultant", RESULT_RECEIVING: "Receiving the result",
    advance: "Complete this step", rejectStep: "Reject the step", recordAnswer: "Record the consultant's answer", noInspections: "No inspection requests yet.", noMatch: "No request matches the view.",
    newInspection: "New inspection request", requestCode: "Request code", unitNumbers: "Unit numbers (comma separated)", pickActivity: "Pick the activity", create: "Create the request", creating: "Creating…", created: "Request created",
    unitsUnknown: "A unit is not in this project", unitsMixed: "The units are of different models", needUnits: "Enter at least one unit number",
    ncrNumber: "NCR number", ncrTitle: "Title", ncrDescription: "Description", ncrDue: "Due date", ncrUnit: "Unit number (optional)", ncrActivity: "Activity (optional)", createNcr: "Create NCR", ncrCreated: "NCR created",
    open: "Open", under_investigation: "Under investigation", corrective_action: "Corrective action", verification: "Verification", closed: "Closed", cancelled: "Cancelled",
    toNext: "Move to", closeNcr: "Close", cancelNcr: "Cancel", noNcrs: "No NCRs yet.", ncrBlocks: "An open NCR on a unit and activity keeps their inspection from being accepted", openCount: "open",
    rulesAccepted: "Answer codes that count as an acceptance", rulesCompletion: "An activity cannot complete before an accepted inspection", rulesMaterial: "Issuing a material that is not approved", rulesNcr: "An open NCR keeps an inspection from being accepted",
    off: "Off", warn: "Warn", block: "Block", saveRules: "Save the rules", rulesSaved: "Rules saved", rulesManager: "Only the company manager changes the rules.",
    responseA: "A — Approved", responseB: "B — Approved as noted", responseC: "C — Revise and resubmit", responseUR: "UR — Under review",
    noPermission: "Your role does not allow changing quality records.", warningNcr: "The answer was recorded, but an NCR is open on this cell:",
  },
  ur: {
    title: "معیار", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش",
    tabInspections: "معائنے کی درخواستیں", tabNcrs: "عدم مطابقت (NCR)", tabRules: "کمپنی کے قواعد",
    unit: "یونٹس", activity: "سرگرمی", consultant: "کنسلٹنٹ", contractor: "ٹھیکیدار", requestedAt: "درخواست کی تاریخ", age: "درخواست کی عمر", days: "دن", step: "مرحلہ", answer: "جواب", none: "—",
    filter: "دکھائیں", all: "سب", awaiting: "جواب کے انتظار میں", answered: "جواب شدہ", accepted: "قبول شدہ", notAccepted: "قبول نہیں",
    acceptedBadge: "قبول شدہ", notAcceptedBadge: "قبول نہیں", holdNote: "جواب قبولیت کا ہے، مگر کھلا NCR اسے شمار ہونے سے روکتا ہے", openNcrFor: "کھلا NCR",
    CONFIGURATIONS: "درخواست کی ترتیب", MANAGER_APPROVAL: "مینیجر کی منظوری", TECHNICAL_ASSISTANT: "تکنیکی معاون", WAITING_CONSULTANT: "کنسلٹنٹ کا انتظار", RESULT_RECEIVING: "نتیجہ وصول کرنا",
    advance: "یہ مرحلہ مکمل کریں", rejectStep: "مرحلہ مسترد کریں", recordAnswer: "کنسلٹنٹ کا جواب درج کریں", noInspections: "ابھی کوئی معائنہ درخواست نہیں۔", noMatch: "کوئی درخواست اس منظر سے نہیں ملتی۔",
    newInspection: "نئی معائنہ درخواست", requestCode: "درخواست کا کوڈ", unitNumbers: "یونٹ نمبر (کوما سے الگ)", pickActivity: "سرگرمی منتخب کریں", create: "درخواست بنائیں", creating: "بنائی جا رہی ہے…", created: "درخواست بن گئی",
    unitsUnknown: "کوئی یونٹ اس پروجیکٹ میں نہیں", unitsMixed: "یونٹس مختلف ماڈلز کے ہیں", needUnits: "کم از کم ایک یونٹ نمبر لکھیں",
    ncrNumber: "NCR نمبر", ncrTitle: "عنوان", ncrDescription: "تفصیل", ncrDue: "آخری تاریخ", ncrUnit: "یونٹ نمبر (اختیاری)", ncrActivity: "سرگرمی (اختیاری)", createNcr: "NCR بنائیں", ncrCreated: "NCR بن گیا",
    open: "کھلا", under_investigation: "زیرِ تحقیق", corrective_action: "اصلاحی کارروائی", verification: "تصدیق", closed: "بند", cancelled: "منسوخ",
    toNext: "منتقل کریں:", closeNcr: "بند کریں", cancelNcr: "منسوخ کریں", noNcrs: "ابھی کوئی NCR نہیں۔", ncrBlocks: "کسی یونٹ اور سرگرمی پر کھلا NCR ان کے معائنے کی قبولیت روک دیتا ہے", openCount: "کھلے",
    rulesAccepted: "وہ جوابی کوڈ جو قبولیت شمار ہوتے ہیں", rulesCompletion: "قبول شدہ معائنے سے پہلے سرگرمی مکمل نہیں ہو سکتی", rulesMaterial: "غیر منظور شدہ مادّہ جاری کرنا", rulesNcr: "کھلا NCR معائنے کی قبولیت روکتا ہے",
    off: "بند", warn: "تنبیہ", block: "روک", saveRules: "قواعد محفوظ کریں", rulesSaved: "قواعد محفوظ ہو گئے", rulesManager: "قواعد صرف کمپنی کا مینیجر بدل سکتا ہے۔",
    responseA: "A — منظور", responseB: "B — نوٹس کے ساتھ منظور", responseC: "C — درست کر کے دوبارہ جمع کریں", responseUR: "UR — زیرِ جائزہ",
    noPermission: "آپ کا کردار معیار کے ریکارڈ بدلنے کی اجازت نہیں دیتا۔", warningNcr: "جواب درج ہو گیا، مگر اس خانے پر NCR کھلا ہے:",
  },
};

const STEPS = ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT", "RESULT_RECEIVING"] as const;
const NEXT: Record<string, string[]> = { open: ["under_investigation"], under_investigation: ["corrective_action"], corrective_action: ["verification"], verification: ["closed"], closed: [], cancelled: [] };
const RESPONSES = ["A", "B", "C", "UR"] as const;
type Mode = "off" | "warn" | "block";
const MODES: Mode[] = ["off", "warn", "block"];
const dayAge = (from: string | Date) => Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));

export default function ProjectQuality() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const utils = trpc.useUtils();
  const options = trpc.siteReports.options.useQuery(scope, { enabled });
  const inspections = trpc.pmc.inspections.useQuery(scope, { enabled });
  const ncrList = trpc.ncrs.list.useQuery(scope, { enabled });
  const policyQuery = trpc.policy.effective.useQuery(scope, { enabled });
  const isManager = useCan("tenant.manage");
  const [tab, setTab] = useState<"inspections" | "ncrs" | "rules">("inspections");
  const [view, setView] = useState<"all" | "awaiting" | "answered" | "accepted" | "notAccepted">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", units: "", activityId: "", consultant: "", contractor: "" });
  const [ncr, setNcr] = useState({ number: "", title: "", description: "", due: "", unit: "", activityId: "" });
  const [rules, setRules] = useState<{ qcCompletionMode: Mode; materialApprovalMode: Mode; ncrAcceptanceMode: Mode; codes: string[] } | null>(null);

  const refresh = () => { void utils.pmc.inspections.invalidate(); void utils.ncrs.list.invalidate(); };
  const createInspection = trpc.pmc.createInspection.useMutation({ onSuccess: () => { setMessage(t.created); setForm(current => ({ ...current, code: "", units: "" })); refresh(); } });
  const advance = trpc.pmc.advanceInspection.useMutation({ onSuccess: refresh });
  const respond = trpc.pmc.respondInspection.useMutation({ onSuccess: result => { const held = (result as { openNcrs?: string[] }).openNcrs; setWarning(held?.length ? `${t.warningNcr} ${held.join(", ")}` : null); refresh(); } });
  const createNcr = trpc.ncrs.create.useMutation({ onSuccess: () => { setMessage(t.ncrCreated); setNcr({ number: "", title: "", description: "", due: "", unit: "", activityId: "" }); refresh(); } });
  const transition = trpc.ncrs.transitionStatus.useMutation({ onSuccess: refresh });
  const saveRules = trpc.policy.set.useMutation({ onSuccess: () => { setMessage(t.rulesSaved); void utils.policy.get.invalidate(); } });

  const units = options.data?.units ?? [];
  const activities = options.data?.activities ?? [];
  const policy = policyQuery.data;
  const acceptedCodes = policy?.qcAcceptedCodes ?? ["A", "B"];
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const activityById = new Map(activities.map(activity => [activity.id, activity]));
  const stepName = (code: string) => (t as Record<string, string>)[code] ?? code;
  const statusName = (code: string) => (t as Record<string, string>)[code] ?? code;
  const requests = inspections.data ?? [];
  const ncrs = ncrList.data ?? [];
  const openNcrKey = new Set(ncrs.filter(item => item.status !== "closed" && item.status !== "cancelled" && item.pmcUnitId && item.pmcActivityDefinitionId).map(item => `${item.pmcUnitId}:${item.pmcActivityDefinitionId}`));
  const heldByNcr = (request: (typeof requests)[number]) => Boolean(request.responseCode) && acceptedCodes.includes(request.responseCode!) && policy?.ncrAcceptanceMode === "block" && request.unitIds.some(unitId => openNcrKey.has(`${unitId}:${request.activityDefinitionId}`));
  const isAccepted = (request: (typeof requests)[number]) => Boolean(request.responseCode) && acceptedCodes.includes(request.responseCode!) && !heldByNcr(request);
  const shown = requests.filter(request => view === "all" || (view === "awaiting" && !request.responseCode) || (view === "answered" && request.responseCode) || (view === "accepted" && isAccepted(request)) || (view === "notAccepted" && request.responseCode && !isAccepted(request)));

  // the form's units, as numbers → rows of this project
  const typed = form.units.split(/[,\s،]+/).filter(Boolean);
  const typedUnits = typed.map(number => units.find(unit => String(unit.number) === number));
  const unitsUnknown = typed.some((_, index) => !typedUnits[index]);
  const models = new Set(typedUnits.filter(Boolean).map(unit => unit!.modelCode));
  const unitsMixed = models.size > 1;
  const model = models.size === 1 ? Array.from(models)[0] : null;
  const activityChoices = model ? activities.filter(activity => activity.modelCode === model) : [];
  const canCreateInspection = form.code.trim() !== "" && typed.length > 0 && !unitsUnknown && !unitsMixed && activityChoices.some(activity => activity.id === form.activityId);
  const ncrUnit = ncr.unit.trim() ? units.find(unit => String(unit.number) === ncr.unit.trim()) : undefined;
  const ncrChoices = ncrUnit ? activities.filter(activity => activity.modelCode === ncrUnit.modelCode) : [];
  const canCreateNcr = ncr.number.trim() !== "" && ncr.title.trim().length >= 2 && ncr.description.trim().length >= 5 && (!ncr.unit.trim() || Boolean(ncrUnit));

  const error = createInspection.error ?? advance.error ?? respond.error ?? createNcr.error ?? transition.error ?? saveRules.error;
  const back = `/m/${tenantId}/${projectId}`;
  const loadError = options.error ?? inspections.error ?? ncrList.error;
  if (options.isLoading || inspections.isLoading || ncrList.isLoading) return <FieldShell wide tenantId={tenantId} projectId={projectId} current="quality" title={t.title} backHref={back} backLabel={t.back}><p role="status" className="text-sm text-slate-500">{t.loading}</p></FieldShell>;
  if (loadError) return <FieldShell wide tenantId={tenantId} projectId={projectId} current="quality" title={t.title} backHref={back} backLabel={t.back}><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(loadError, isArabic)}</p><Button className={tap} variant="outline" onClick={() => { void options.refetch(); void inspections.refetch(); void ncrList.refetch(); }}>{t.retry}</Button></FieldShell>;

  const tabButton = (value: typeof tab, label: string) => <button type="button" role="tab" aria-selected={tab === value} className={`${tap} rounded-xl px-3 text-sm font-semibold ${tab === value ? "bg-[#0e6b70] text-white" : "border bg-white text-slate-800"}`} onClick={() => { setTab(value); setMessage(null); }}>{label}</button>;
  const draft = rules ?? (policy ? { qcCompletionMode: policy.qcCompletionMode as Mode, materialApprovalMode: policy.materialApprovalMode as Mode, ncrAcceptanceMode: policy.ncrAcceptanceMode as Mode, codes: policy.qcAcceptedCodes } : null);
  const modeSelect = (label: string, key: "qcCompletionMode" | "materialApprovalMode" | "ncrAcceptanceMode") => draft && <label className="block text-sm font-medium">{label}<select className={`${fieldInput} mt-1`} value={draft[key]} disabled={!isManager} onChange={event => setRules({ ...draft, [key]: event.target.value as Mode })}>{MODES.map(mode => <option key={mode} value={mode}>{(t as Record<string, string>)[mode]}</option>)}</select></label>;

  return (
    <FieldShell wide tenantId={tenantId} projectId={projectId} current="quality" title={t.title} backHref={back} backLabel={t.back}>
      <div role="tablist" className="flex flex-wrap gap-2">{tabButton("inspections", t.tabInspections)}{tabButton("ncrs", `${t.tabNcrs} (${ncrs.filter(item => item.status !== "closed" && item.status !== "cancelled").length} ${t.openCount})`)}{tabButton("rules", t.tabRules)}</div>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
      {warning && <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}

      {tab === "inspections" && (
        <section aria-label={t.tabInspections} className="space-y-3">
          <WriteGate permission="project.pmc.update" projectId={projectId} reason={{ ar: text.ar.noPermission, en: text.en.noPermission, ur: text.ur.noPermission }}>
            <details className="rounded-xl border bg-white p-3">
              <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.newInspection}</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-sm font-medium">{t.requestCode}<input className={`${fieldInput} mt-1`} value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></label>
                <label className="block text-sm font-medium">{t.unitNumbers}<input className={`${fieldInput} mt-1`} inputMode="numeric" value={form.units} onChange={event => setForm({ ...form, units: event.target.value, activityId: "" })} /></label>
                {typed.length === 0 && <p className="text-sm text-slate-600 sm:col-span-2">{t.needUnits}</p>}
                {unitsUnknown && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{t.unitsUnknown}</p>}
                {unitsMixed && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{t.unitsMixed}</p>}
                <label className="block text-sm font-medium sm:col-span-2">{t.activity}<select className={`${fieldInput} mt-1`} value={form.activityId} disabled={activityChoices.length === 0} onChange={event => setForm({ ...form, activityId: event.target.value })}><option value="">{t.pickActivity}</option>{activityChoices.map(activity => <option key={activity.id} value={activity.id}>{activity.code} — {activity.name}</option>)}</select></label>
                <label className="block text-sm font-medium">{t.consultant}<input className={`${fieldInput} mt-1`} value={form.consultant} onChange={event => setForm({ ...form, consultant: event.target.value })} /></label>
                <label className="block text-sm font-medium">{t.contractor}<input className={`${fieldInput} mt-1`} value={form.contractor} onChange={event => setForm({ ...form, contractor: event.target.value })} /></label>
              </div>
              <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!canCreateInspection || createInspection.isPending} onClick={() => { setMessage(null); createInspection.mutate({ ...scope, requestCode: form.code.trim(), activityDefinitionId: form.activityId, unitIds: typedUnits.map(unit => unit!.id), consultantLabel: form.consultant.trim() || undefined, contractorLabel: form.contractor.trim() || undefined, requestedAt: new Date() }); }}>{createInspection.isPending ? t.creating : t.create}</Button>
            </details>
          </WriteGate>
          <label className="block text-sm font-medium sm:max-w-xs">{t.filter}<select className={`${fieldInput} mt-1`} value={view} onChange={event => setView(event.target.value as typeof view)}>
            <option value="all">{t.all}</option><option value="awaiting">{t.awaiting}</option><option value="answered">{t.answered}</option><option value="accepted">{t.accepted}</option><option value="notAccepted">{t.notAccepted}</option></select></label>
          {requests.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noInspections}</p>
            : shown.length === 0 ? <p role="status" className="text-sm text-slate-600">{t.noMatch}</p>
            : <ul className="space-y-2">{shown.map(request => {
              const current = request.steps.find(step => step.status === "in_progress");
              const atResult = current?.stepCode === "RESULT_RECEIVING";
              const accepted = isAccepted(request);
              return (
                <li key={request.id} className="space-y-2 rounded-xl border bg-white p-3" data-request={request.requestCode} data-answer={request.responseCode ?? ""}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><p className="text-base font-semibold">{request.requestCode}</p>
                      <p className="text-sm">{t.unit}: {request.unitIds.map(id => unitById.get(id)?.number ?? "?").join(", ")} · {activityById.get(request.activityDefinitionId)?.code ?? "?"}</p>
                      <p className="text-xs text-slate-600">{t.consultant}: {request.consultantLabel ?? t.none} · {t.contractor}: {request.contractorLabel ?? t.none} · {showDate(request.requestedAt, language)}</p></div>
                    <div className="text-end text-sm">
                      {request.responseCode ? <p className="font-semibold">{t.answer}: {request.responseCode} · <span className={accepted ? "text-emerald-700" : "text-red-700"}>{accepted ? t.acceptedBadge : t.notAcceptedBadge}</span></p> : <p className="text-slate-600">{t.age}: {dayAge(request.requestedAt)} {t.days}</p>}
                      {current && <p className="text-xs text-slate-600">{t.step}: {stepName(current.stepCode)} ({request.steps.findIndex(step => step.id === current.id) + 1}/{STEPS.length})</p>}
                    </div>
                  </div>
                  {heldByNcr(request) && <p role="note" className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t.holdNote}</p>}
                  <WriteGate permission="project.pmc.update" projectId={projectId}>
                    {current && !atResult && <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className={tap} disabled={advance.isPending} onClick={() => advance.mutate({ ...scope, inspectionRequestId: request.id, stepCode: current.stepCode as (typeof STEPS)[number], outcome: "complete" })}>{t.advance}</Button>
                      <Button variant="outline" className={tap} disabled={advance.isPending} onClick={() => advance.mutate({ ...scope, inspectionRequestId: request.id, stepCode: current.stepCode as (typeof STEPS)[number], outcome: "rejected" })}>{t.rejectStep}</Button></div>}
                    {atResult && !request.responseCode && <div className="space-y-1"><p className="text-sm font-medium">{t.recordAnswer}</p><div className="flex flex-wrap gap-2">{RESPONSES.map(code => <Button key={code} variant="outline" className={tap} disabled={respond.isPending} onClick={() => { setWarning(null); respond.mutate({ ...scope, inspectionRequestId: request.id, responseCode: code }); }}>{(t as Record<string, string>)[`response${code}`]}</Button>)}</div></div>}
                  </WriteGate>
                </li>
              );
            })}</ul>}
        </section>
      )}

      {tab === "ncrs" && (
        <section aria-label={t.tabNcrs} className="space-y-3">
          <p className="text-sm text-slate-600">{t.ncrBlocks}.</p>
          <WriteGate permission="project.pmc.update" projectId={projectId} reason={{ ar: text.ar.noPermission, en: text.en.noPermission, ur: text.ur.noPermission }}>
            <details className="rounded-xl border bg-white p-3">
              <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.createNcr}</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="block text-sm font-medium">{t.ncrNumber}<input className={`${fieldInput} mt-1`} value={ncr.number} onChange={event => setNcr({ ...ncr, number: event.target.value })} /></label>
                <label className="block text-sm font-medium">{t.ncrDue}<input className={`${fieldInput} mt-1`} type="date" value={ncr.due} onChange={event => setNcr({ ...ncr, due: event.target.value })} /></label>
                <label className="block text-sm font-medium sm:col-span-2">{t.ncrTitle}<input className={`${fieldInput} mt-1`} value={ncr.title} onChange={event => setNcr({ ...ncr, title: event.target.value })} /></label>
                <label className="block text-sm font-medium sm:col-span-2">{t.ncrDescription}<textarea className="mt-1 min-h-[72px] w-full rounded-xl border bg-white p-3 text-base" value={ncr.description} onChange={event => setNcr({ ...ncr, description: event.target.value })} /></label>
                <label className="block text-sm font-medium">{t.ncrUnit}<input className={`${fieldInput} mt-1`} inputMode="numeric" value={ncr.unit} onChange={event => setNcr({ ...ncr, unit: event.target.value, activityId: "" })} /></label>
                <label className="block text-sm font-medium">{t.ncrActivity}<select className={`${fieldInput} mt-1`} value={ncr.activityId} disabled={ncrChoices.length === 0} onChange={event => setNcr({ ...ncr, activityId: event.target.value })}><option value="">{t.none}</option>{ncrChoices.map(activity => <option key={activity.id} value={activity.id}>{activity.code} — {activity.name}</option>)}</select></label>
                {ncr.unit.trim() && !ncrUnit && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{t.unitsUnknown}</p>}
              </div>
              <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!canCreateNcr || createNcr.isPending} onClick={() => { setMessage(null); createNcr.mutate({ ...scope, ncrNumber: ncr.number.trim(), title: ncr.title.trim(), description: ncr.description.trim(), dueAt: ncr.due ? new Date(`${ncr.due}T12:00:00Z`) : undefined, pmcUnitId: ncrUnit?.id, pmcActivityDefinitionId: ncr.activityId || undefined }); }}>{t.createNcr}</Button>
            </details>
          </WriteGate>
          {ncrs.length === 0 ? <p role="status" className="rounded-2xl border border-dashed p-6 text-center text-slate-600">{t.noNcrs}</p>
            : <ul className="space-y-2">{ncrs.map(item => {
              const next = NEXT[item.status] ?? [];
              const cell = item.pmcUnitId ? `${t.unit}: ${unitById.get(item.pmcUnitId)?.number ?? "?"}${item.pmcActivityDefinitionId ? ` · ${activityById.get(item.pmcActivityDefinitionId)?.code ?? "?"}` : ""}` : null;
              return (
                <li key={item.id} className="space-y-2 rounded-xl border bg-white p-3" data-ncr={item.ncrNumber} data-status={item.status}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-base font-semibold">{item.ncrNumber} · {item.title}</p><p className="text-sm text-slate-700">{item.description}</p>{cell && <p className="text-xs text-slate-600">{cell}</p>}</div>
                    <div className="text-end text-sm"><p className="font-semibold">{statusName(item.status)}</p><p className="text-xs text-slate-600">{t.age}: {dayAge(item.createdAt)} {t.days}</p></div></div>
                  <WriteGate permission="project.pmc.update" projectId={projectId}>
                    <div className="flex flex-wrap gap-2">
                      {next.map(status => <Button key={status} variant="outline" className={tap} disabled={transition.isPending} onClick={() => transition.mutate({ ...scope, ncrId: item.id, nextStatus: status as "closed" })}>{status === "closed" ? t.closeNcr : `${t.toNext} ${statusName(status)}`}</Button>)}
                      {item.status !== "closed" && item.status !== "cancelled" && <Button variant="outline" className={tap} disabled={transition.isPending} onClick={() => transition.mutate({ ...scope, ncrId: item.id, nextStatus: "cancelled" })}>{t.cancelNcr}</Button>}
                    </div>
                  </WriteGate>
                </li>
              );
            })}</ul>}
        </section>
      )}

      {tab === "rules" && (
        <section aria-label={t.tabRules} className="space-y-3">
          {policyQuery.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(policyQuery.error, isArabic)}</p>}
          {!isManager && <p role="note" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{t.rulesManager}</p>}
          {draft && (
            <div className="space-y-3 rounded-xl border bg-white p-3">
              <fieldset className="space-y-1"><legend className="text-sm font-medium">{t.rulesAccepted}</legend><div className="flex flex-wrap gap-3">{RESPONSES.map(code => <label key={code} className={`${tap} flex items-center gap-2 text-sm`}><input type="checkbox" disabled={!isManager} checked={draft.codes.includes(code)} onChange={event => setRules({ ...draft, codes: event.target.checked ? [...draft.codes, code] : draft.codes.filter(item => item !== code) })} />{(t as Record<string, string>)[`response${code}`]}</label>)}</div></fieldset>
              {modeSelect(t.rulesCompletion, "qcCompletionMode")}
              {modeSelect(t.rulesMaterial, "materialApprovalMode")}
              {modeSelect(t.rulesNcr, "ncrAcceptanceMode")}
              {isManager && <Button className={tap} disabled={saveRules.isPending || draft.codes.length === 0} onClick={() => { setMessage(null); saveRules.mutate({ tenantId, qcCompletionMode: draft.qcCompletionMode, qcAcceptedCodes: draft.codes, materialApprovalMode: draft.materialApprovalMode, ncrAcceptanceMode: draft.ncrAcceptanceMode }); }}>{t.saveRules}</Button>}
            </div>
          )}
        </section>
      )}
    </FieldShell>
  );
}

