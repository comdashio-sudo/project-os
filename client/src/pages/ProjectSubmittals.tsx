import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";

// The consultant submittals register (work order 14, item 1): every submittal the contractor sent the consultant — execution drawings, materials, method statements,
// samples — with the day it went, how long it has sat there, the answer's code, and per consultant how the answers are distributed. The codes are the company's own
// (A/B/C/D by default); what counts as an approval is the company's setting, and the server — not this screen — decides who may send, answer and close.
const text = {
  ar: {
    title: "سجل تسليمات الاستشاري", back: "العودة إلى الإدخال السريع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", empty: "لا تسليمات بعد.", emptyBody: "أنشئ أول تسليم من النموذج أعلاه ليظهر هنا.", noMatch: "لا تسليم يطابق المرشحات.",
    total: "الإجمالي", waiting: "عند الاستشاري", overdue: "متأخرة", average: "متوسط الأيام عند الاستشاري", approvedShare: "نسبة المعتمد من المُجاب عنه", days: "يوم",
    filters: "المرشحات", search: "بحث بالرقم أو العنوان", status: "الحالة", type: "النوع", consultant: "الاستشاري", all: "الكل", onlyOverdue: "المتأخرة فقط", noConsultant: "بلا استشاري",
    draft: "مسودة", sent: "مُرسَل", replied: "مُجاب", closed: "مُغلق",
    shop_drawing: "مخططات تنفيذية", material_approval: "اعتماد مادة", method_statement: "طريقة تنفيذ", sample: "عيّنة",
    number: "الرقم", revision: "المراجعة", titleCol: "العنوان", sentAt: "أُرسل", dueAt: "الاستحقاق", age: "العمر عند الاستشاري", code: "الرمز", actions: "إجراءات", pending: "بانتظار الرد",
    distribution: "توزيع الرموز لكل استشاري", distributionHint: "أعداد المُجاب عنه حسب رمز الشركة، مع ما لم يُجب بعد.",
    createType: "نوع التسليم", create: "تسليم جديد", createNumber: "رقم التسليم", createTitle: "العنوان", createConsultant: "أُرسل إلى (الاستشاري)", createDue: "تاريخ الاستحقاق", createMaterial: "المادة", pickMaterial: "اختر المادة", save: "إنشاء التسليم", saving: "جارٍ الحفظ…", created: "أُنشئ التسليم",
    send: "إرسال إلى الاستشاري", reply: "تسجيل الرد", closeIt: "إغلاق", resubmit: "إعادة تقديم (مراجعة جديدة)", replyCode: "رمز الرد", replyNote: "ملاحظة الرد", confirmReply: "حفظ الرد", cancel: "إلغاء",
    approvedCode: "يُعدّ اعتمادًا", notApprovedCode: "لا يُعدّ اعتمادًا", noPermission: "دورك لا يتيح إنشاء التسليمات.", exportTitle: "سجل تسليمات الاستشاري",
  },
  en: {
    title: "Consultant submittals register", back: "Back to quick entry", loading: "Loading…", retry: "Retry", empty: "No submittals yet.", emptyBody: "Create the first submittal with the form above and it appears here.", noMatch: "No submittal matches the filters.",
    total: "Total", waiting: "With the consultant", overdue: "Overdue", average: "Average days with the consultant", approvedShare: "Approved, of those answered", days: "d",
    filters: "Filters", search: "Search by number or title", status: "Status", type: "Type", consultant: "Consultant", all: "All", onlyOverdue: "Overdue only", noConsultant: "No consultant",
    draft: "Draft", sent: "Sent", replied: "Answered", closed: "Closed",
    shop_drawing: "Shop drawings", material_approval: "Material approval", method_statement: "Method statement", sample: "Sample",
    number: "Number", revision: "Rev", titleCol: "Title", sentAt: "Sent", dueAt: "Due", age: "Age with the consultant", code: "Code", actions: "Actions", pending: "Awaiting reply",
    distribution: "Reply codes per consultant", distributionHint: "Answered submittals by the company's code, with those still waiting.",
    createType: "Submittal type", create: "New submittal", createNumber: "Submittal number", createTitle: "Title", createConsultant: "Sent to (consultant)", createDue: "Due date", createMaterial: "Material", pickMaterial: "Pick the material", save: "Create submittal", saving: "Saving…", created: "Submittal created",
    send: "Send to the consultant", reply: "Record the reply", closeIt: "Close", resubmit: "Resubmit (new revision)", replyCode: "Reply code", replyNote: "Reply note", confirmReply: "Save the reply", cancel: "Cancel",
    approvedCode: "counts as an approval", notApprovedCode: "does not count as an approval", noPermission: "Your role does not allow creating submittals.", exportTitle: "Consultant submittals register",
  },
  ur: {
    title: "کنسلٹنٹ کی سبمٹلز کا رجسٹر", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش", empty: "ابھی کوئی سبمٹل نہیں۔", emptyBody: "اوپر کے فارم سے پہلا سبمٹل بنائیں، وہ یہاں نظر آئے گا۔", noMatch: "کوئی سبمٹل فلٹرز سے نہیں ملتا۔",
    total: "کل", waiting: "کنسلٹنٹ کے پاس", overdue: "تاخیر شدہ", average: "کنسلٹنٹ کے پاس اوسط دن", approvedShare: "جواب شدہ میں سے منظور شدہ", days: "دن",
    filters: "فلٹرز", search: "نمبر یا عنوان سے تلاش", status: "حالت", type: "قسم", consultant: "کنسلٹنٹ", all: "سب", onlyOverdue: "صرف تاخیر شدہ", noConsultant: "کنسلٹنٹ نہیں",
    draft: "مسودہ", sent: "بھیجا گیا", replied: "جواب آ گیا", closed: "بند",
    shop_drawing: "شاپ ڈرائنگز", material_approval: "مادّے کی منظوری", method_statement: "طریقۂ کار کا بیان", sample: "نمونہ",
    number: "نمبر", revision: "نظرثانی", titleCol: "عنوان", sentAt: "بھیجا گیا", dueAt: "آخری تاریخ", age: "کنسلٹنٹ کے پاس مدت", code: "کوڈ", actions: "کارروائیاں", pending: "جواب کا انتظار",
    distribution: "ہر کنسلٹنٹ کے جوابی کوڈ", distributionHint: "کمپنی کے کوڈ کے مطابق جواب شدہ سبمٹلز، اور وہ جو ابھی منتظر ہیں۔",
    createType: "سبمٹل کی قسم", create: "نیا سبمٹل", createNumber: "سبمٹل نمبر", createTitle: "عنوان", createConsultant: "بھیجا گیا (کنسلٹنٹ)", createDue: "آخری تاریخ", createMaterial: "مادّہ", pickMaterial: "مادّہ منتخب کریں", save: "سبمٹل بنائیں", saving: "محفوظ کیا جا رہا ہے…", created: "سبمٹل بن گیا",
    send: "کنسلٹنٹ کو بھیجیں", reply: "جواب درج کریں", closeIt: "بند کریں", resubmit: "دوبارہ جمع کرائیں (نئی نظرثانی)", replyCode: "جوابی کوڈ", replyNote: "جواب کا نوٹ", confirmReply: "جواب محفوظ کریں", cancel: "منسوخ",
    approvedCode: "منظوری شمار ہوتا ہے", notApprovedCode: "منظوری شمار نہیں ہوتا", noPermission: "آپ کا کردار سبمٹل بنانے کی اجازت نہیں دیتا۔", exportTitle: "کنسلٹنٹ کی سبمٹلز کا رجسٹر",
  },
};

const TYPES = ["shop_drawing", "material_approval", "method_statement", "sample"] as const;
const STATUSES = ["draft", "sent", "replied", "closed"] as const;
type Type = (typeof TYPES)[number];
type Status = (typeof STATUSES)[number];
const NONE = "__none__";
const WRITE = ["project.field.manage", "project.design.manage", "project.manage"];
const REPLY = ["project.design.approve", "project.manage"];

export default function ProjectSubmittals() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const utils = trpc.useUtils();
  const list = trpc.submittals.list.useQuery(scope, { enabled });
  const codes = trpc.submittals.replyCodes.useQuery(scope, { enabled });
  const materials = trpc.materials.list.useQuery(scope, { enabled });
  const refresh = () => { void utils.submittals.list.invalidate(); };

  const [status, setStatus] = useState<Status | "all">("all");
  const [type, setType] = useState<Type | "all">("all");
  const [consultant, setConsultant] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [form, setForm] = useState({ type: "shop_drawing" as Type, number: "", title: "", consultant: "", due: "", materialId: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [replying, setReplying] = useState<{ id: string; code: string; note: string } | null>(null);

  const create = trpc.submittals.create.useMutation({ onSuccess: () => { setMessage(t.created); setForm(current => ({ ...current, number: "", title: "" })); refresh(); } });
  const send = trpc.submittals.send.useMutation({ onSuccess: refresh });
  const reply = trpc.submittals.reply.useMutation({ onSuccess: () => { setReplying(null); refresh(); } });
  const close = trpc.submittals.close.useMutation({ onSuccess: refresh });

  const rows = list.data ?? [];
  const replyCodes = (codes.data ?? []).filter(code => code.active);
  const approvedOf = new Map((codes.data ?? []).map(code => [code.code, code.approved]));
  const consultants = useMemo(() => Array.from(new Set(rows.map(row => row.consultant ?? NONE))).sort(), [rows]);
  const typeName = (value: string) => (t as Record<string, string>)[value] ?? value;
  const statusName = (value: string) => (t as Record<string, string>)[value] ?? value;
  const consultantName = (value: string | null) => value ?? t.noConsultant;

  const shown = rows.filter(row =>
    (status === "all" || row.status === status) && (type === "all" || row.submittalType === type) && (consultant === "all" || (row.consultant ?? NONE) === consultant)
    && (!onlyOverdue || row.overdue) && (!query.trim() || `${row.submittalNumber} ${row.title}`.toLowerCase().includes(query.trim().toLowerCase())));

  const waiting = rows.filter(row => row.status === "sent");
  const answered = rows.filter(row => row.replyCode);
  const ages = answered.map(row => row.daysAtConsultant).concat(waiting.map(row => row.daysAtConsultant)).filter((value): value is number => value !== null);
  const average = ages.length ? Math.round(ages.reduce((sum, value) => sum + value, 0) / ages.length) : null;
  const approvedCount = answered.filter(row => row.approved === true).length;

  // consultant × code, over the rows the filters leave
  const distribution = useMemo(() => {
    const names = Array.from(new Set(shown.map(row => row.consultant ?? NONE))).sort();
    return names.map(name => {
      const mine = shown.filter(row => (row.consultant ?? NONE) === name);
      return { name, perCode: Object.fromEntries(replyCodes.map(code => [code.code, mine.filter(row => row.replyCode === code.code).length])) as Record<string, number>, pending: mine.filter(row => !row.replyCode && row.status !== "closed").length, total: mine.length };
    });
  }, [shown, replyCodes]);

  const error = create.error ?? send.error ?? reply.error ?? close.error;
  const columns = [
    { header: t.number, value: (row: (typeof rows)[number]) => row.submittalNumber },
    { header: t.revision, value: (row: (typeof rows)[number]) => row.revision, kind: "number" as const },
    { header: t.titleCol, value: (row: (typeof rows)[number]) => row.title },
    { header: t.type, value: (row: (typeof rows)[number]) => typeName(row.submittalType) },
    { header: t.consultant, value: (row: (typeof rows)[number]) => row.consultant ?? "" },
    { header: t.status, value: (row: (typeof rows)[number]) => statusName(row.status) },
    { header: t.sentAt, value: (row: (typeof rows)[number]) => row.sentAt ?? null, kind: "date" as const },
    { header: t.dueAt, value: (row: (typeof rows)[number]) => row.dueAt ?? null, kind: "date" as const },
    { header: t.age, value: (row: (typeof rows)[number]) => row.daysAtConsultant, kind: "number" as const },
    { header: t.code, value: (row: (typeof rows)[number]) => row.replyCode ?? "" },
  ];

  const back = `/m/${tenantId}/${projectId}`;
  if (list.isLoading || codes.isLoading) return <FieldShell wide title={t.title} backHref={back} backLabel={t.back}><p role="status" className="text-sm text-slate-500">{t.loading}</p></FieldShell>;
  const loadError = list.error ?? codes.error;
  if (loadError) return <FieldShell wide title={t.title} backHref={back} backLabel={t.back}><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(loadError, isArabic)}</p><Button className={tap} variant="outline" onClick={() => { void list.refetch(); void codes.refetch(); }}>{t.retry}</Button></FieldShell>;

  const canCreate = form.number.trim() !== "" && form.title.trim().length >= 2 && (form.type !== "material_approval" || form.materialId !== "");
  const tile = (label: string, value: string, flag?: boolean) => <div className={`rounded-xl border bg-white p-3 ${flag ? "border-red-300" : ""}`}><p className="text-xs text-slate-600">{label}</p><p className="text-xl font-semibold">{value}</p></div>;

  return (
    <FieldShell wide title={t.title} backHref={back} backLabel={t.back}>
      <section aria-label={t.total} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tile(t.total, String(rows.length))}
        {tile(t.waiting, String(waiting.length))}
        {tile(t.overdue, String(rows.filter(row => row.overdue).length), rows.some(row => row.overdue))}
        {tile(t.average, average === null ? "—" : `${average} ${t.days}`)}
        {answered.length > 0 && tile(t.approvedShare, `${Math.round((approvedCount / answered.length) * 100)}%`)}
      </section>

      <WriteGate permission={WRITE} projectId={projectId} reason={{ ar: text.ar.noPermission, en: text.en.noPermission, ur: text.ur.noPermission }}>
        <details className="rounded-xl border bg-white p-3" open={rows.length === 0}>
          <summary className={`${tap} flex cursor-pointer items-center text-base font-semibold`}>{t.create}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-sm font-medium">{t.createType}<select className={`${fieldInput} mt-1`} value={form.type} onChange={event => setForm({ ...form, type: event.target.value as Type })}>{TYPES.map(value => <option key={value} value={value}>{typeName(value)}</option>)}</select></label>
            <label className="block text-sm font-medium">{t.createNumber}<input className={`${fieldInput} mt-1`} value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} /></label>
            <label className="block text-sm font-medium sm:col-span-2">{t.createTitle}<input className={`${fieldInput} mt-1`} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
            <label className="block text-sm font-medium">{t.createConsultant}<input className={`${fieldInput} mt-1`} list="submittal-consultants" value={form.consultant} onChange={event => setForm({ ...form, consultant: event.target.value })} /></label>
            <datalist id="submittal-consultants">{consultants.filter(name => name !== NONE).map(name => <option key={name} value={name} />)}</datalist>
            <label className="block text-sm font-medium">{t.createDue}<input className={`${fieldInput} mt-1`} type="date" value={form.due} onChange={event => setForm({ ...form, due: event.target.value })} /></label>
            {form.type === "material_approval" && <label className="block text-sm font-medium sm:col-span-2">{t.createMaterial}<select className={`${fieldInput} mt-1`} value={form.materialId} onChange={event => setForm({ ...form, materialId: event.target.value })}><option value="">{t.pickMaterial}</option>{(materials.data ?? []).map(material => <option key={material.id} value={material.id}>{material.code} — {material.description}</option>)}</select></label>}
          </div>
          <Button className={`${tap} mt-2 w-full sm:w-auto`} disabled={!canCreate || create.isPending} onClick={() => { setMessage(null); create.mutate({ ...scope, submittalType: form.type, submittalNumber: form.number.trim(), title: form.title.trim(), consultant: form.consultant.trim() || undefined, dueAt: form.due ? new Date(`${form.due}T12:00:00Z`) : undefined, materialId: form.type === "material_approval" ? form.materialId : undefined }); }}>{create.isPending ? t.saving : t.save}</Button>
        </details>
      </WriteGate>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}

      <section aria-label={t.filters} className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-5">
        <label className="block text-sm font-medium sm:col-span-2">{t.search}<input className={`${fieldInput} mt-1`} type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="block text-sm font-medium">{t.status}<select className={`${fieldInput} mt-1`} value={status} onChange={event => setStatus(event.target.value as Status | "all")}><option value="all">{t.all}</option>{STATUSES.map(value => <option key={value} value={value}>{statusName(value)}</option>)}</select></label>
        <label className="block text-sm font-medium">{t.type}<select className={`${fieldInput} mt-1`} value={type} onChange={event => setType(event.target.value as Type | "all")}><option value="all">{t.all}</option>{TYPES.map(value => <option key={value} value={value}>{typeName(value)}</option>)}</select></label>
        <label className="block text-sm font-medium">{t.consultant}<select className={`${fieldInput} mt-1`} value={consultant} onChange={event => setConsultant(event.target.value)}><option value="all">{t.all}</option>{consultants.map(name => <option key={name} value={name}>{name === NONE ? t.noConsultant : name}</option>)}</select></label>
        <label className={`${tap} flex items-center gap-2 text-sm font-medium sm:col-span-5`}><input type="checkbox" checked={onlyOverdue} onChange={event => setOnlyOverdue(event.target.checked)} />{t.onlyOverdue}</label>
      </section>

      <section aria-label={t.distribution} className="space-y-2">
        <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{t.distribution}</h2><ExportExcelButton fileName="consultant-submittals" sheetName={t.exportTitle} title={t.exportTitle} rows={shown} columns={columns} /></div>
        <p className="text-sm text-slate-600">{t.distributionHint}</p>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-start text-sm" data-distribution>
            <thead><tr className="bg-slate-50"><th scope="col" className="p-2 text-start">{t.consultant}</th>{replyCodes.map(code => <th scope="col" key={code.code} className="p-2 text-center" title={`${isArabic ? code.labelAr : code.labelEn} — ${code.approved ? t.approvedCode : t.notApprovedCode}`}>{code.code}</th>)}<th scope="col" className="p-2 text-center">{t.pending}</th><th scope="col" className="p-2 text-center">{t.total}</th></tr></thead>
            <tbody>{distribution.map(line => <tr key={line.name} className="border-t"><th scope="row" className="p-2 text-start font-medium">{line.name === NONE ? t.noConsultant : line.name}</th>{replyCodes.map(code => <td key={code.code} className="p-2 text-center">{line.perCode[code.code]}</td>)}<td className="p-2 text-center">{line.pending}</td><td className="p-2 text-center font-semibold">{line.total}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      {rows.length === 0 ? <div role="status" className="rounded-2xl border border-dashed p-6 text-center"><p className="font-semibold">{t.empty}</p><p className="text-sm text-slate-600">{t.emptyBody}</p></div>
        : shown.length === 0 ? <p role="status" className="text-sm text-slate-600">{t.noMatch}</p>
        : (
          <ul className="space-y-2" aria-label={t.title}>
            {shown.map(row => (
              <li key={row.id} className={`space-y-2 rounded-xl border bg-white p-3 ${row.overdue ? "border-red-300" : ""}`} data-submittal={row.submittalNumber} data-status={row.status}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-base font-semibold">{row.submittalNumber} <span className="text-xs font-normal text-slate-600">{t.revision} {row.revision}</span></p><p className="text-sm">{row.title}</p>
                    <p className="text-xs text-slate-600">{typeName(row.submittalType)} · {consultantName(row.consultant)}</p></div>
                  <div className="text-end text-sm"><p className="font-semibold">{statusName(row.status)}{row.replyCode ? ` · ${row.replyCode}` : ""}</p>
                    {row.daysAtConsultant !== null && <p className={row.overdue ? "text-red-700" : "text-slate-600"}>{row.daysAtConsultant} {t.days}{row.overdue ? ` · ${t.overdue}` : ""}</p>}</div>
                </div>
                <p className="text-xs text-slate-600">{t.sentAt}: {showDate(row.sentAt, language)} · {t.dueAt}: {showDate(row.dueAt, language)}{row.replyCode && approvedOf.has(row.replyCode) ? ` · ${approvedOf.get(row.replyCode) ? t.approvedCode : t.notApprovedCode}` : ""}</p>
                <div className="flex flex-wrap gap-2">
                  {row.status === "draft" && <WriteGate permission={WRITE} projectId={projectId}><Button variant="outline" className={tap} disabled={send.isPending} onClick={() => send.mutate({ ...scope, submittalId: row.id })}>{t.send}</Button></WriteGate>}
                  {row.status === "sent" && <WriteGate permission={REPLY} projectId={projectId}><Button variant="outline" className={tap} onClick={() => setReplying({ id: row.id, code: replyCodes[0]?.code ?? "", note: "" })}>{t.reply}</Button></WriteGate>}
                  {row.status === "replied" && <WriteGate permission={WRITE} projectId={projectId}><Button variant="outline" className={tap} disabled={close.isPending} onClick={() => close.mutate({ ...scope, submittalId: row.id })}>{t.closeIt}</Button></WriteGate>}
                  {row.status === "replied" && row.approved === false && <WriteGate permission={WRITE} projectId={projectId}><Button variant="outline" className={tap} disabled={create.isPending} onClick={() => create.mutate({ ...scope, submittalType: row.submittalType, submittalNumber: row.submittalNumber, title: row.title, resubmissionOfId: row.id })}>{t.resubmit}</Button></WriteGate>}
                </div>
                {replying?.id === row.id && (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-2" data-reply-form>
                    <label className="block text-sm font-medium">{t.replyCode}<select className={`${fieldInput} mt-1`} value={replying.code} onChange={event => setReplying({ ...replying, code: event.target.value })}>{replyCodes.map(code => <option key={code.code} value={code.code}>{code.code} — {isArabic ? code.labelAr : code.labelEn} ({code.approved ? t.approvedCode : t.notApprovedCode})</option>)}</select></label>
                    <label className="block text-sm font-medium">{t.replyNote}<input className={`${fieldInput} mt-1`} value={replying.note} onChange={event => setReplying({ ...replying, note: event.target.value })} /></label>
                    <div className="grid grid-cols-2 gap-2"><Button className={tap} disabled={!replying.code || reply.isPending} onClick={() => reply.mutate({ ...scope, submittalId: row.id, replyCode: replying.code, replyNote: replying.note.trim() || undefined })}>{t.confirmReply}</Button><Button variant="outline" className={tap} onClick={() => setReplying(null)}>{t.cancel}</Button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </FieldShell>
  );
}
