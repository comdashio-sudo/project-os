import React, { useState } from "react";
import { ListChecks } from "lucide-react";
import { Badge, Button, EmptyState, Field, formatNumber, Segmented, Select, SkeletonRows, TableScroll, TextInput } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { SectionFailed } from "@/components/ScreenStates";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan, WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { EquipmentImport, TrackerImport } from "@/components/referenceLists/ReferenceImports";

// D-84 (P-37): the project's reference lists the daily report chooses from (#233): labour roles (direct / indirect), the equipment register and the unit of
// measure of each site activity. Everyone on the project reads them; changing them is project.manage, and the server refuses the same (PERMISSION_DENIED).
// A stopped role or machine stays in the list, marked, so a past report that names it still reads; the daily report offers active ones only.
const text = {
  ar: {
    title: "القوائم المرجعية للمشروع", tabs: "القائمة", roles: "أدوار العمالة", equipment: "المعدات", activities: "الأنشطة ووحداتها",
    readOnly: "لا تملك صلاحية تعديل القوائم المرجعية؛ تعرضها فقط. يعدّلها مدير المشروع.",
    direct: "مباشرة", indirect: "غير مباشرة", category: "الفئة", name: "الاسم", add: "أضف", save: "احفظ", edit: "تعديل", cancel: "إلغاء", stop: "إيقاف", activate: "تفعيل", stopped: "موقوف", status: "الحالة", actions: "الإجراءات",
    noRoles: "لا أدوار عمالة بعد", noRolesLine: "انسخ القائمة الافتراضية ثم عدّلها، أو أضف أدوار مشروعك واحدًا واحدًا.", seed: "انسخ القائمة الافتراضية", seeded: (n: number) => `أُضيف ${n} دورًا.`,
    type: "النوع", model: "الطراز", plate: "اللوحة أو المقاس", owner: "المالك", noOwner: "بلا مالك", noEquipment: "لا معدات بعد", noEquipmentLine: "أضف أول معدة بنوعها، أو استورد قائمة المعدات من Excel.", addEquipment: "أضف معدة",
    code: "الرمز", unit: "وحدة القياس", total: "الكمية الكلية", units: { villa: "فيلا", lm: "متر طولي", m2: "متر مربع", piece: "قطعة" }, totalNeeded: "الكمية الكلية مطلوبة لغير الفيلا.",
    noActivities: "لا أنشطة موقع بعد", noActivitiesLine: "تأتي الأنشطة من مصفوفة الإنجاز حين تُستورد؛ بعدها تحدّد هنا وحدة كل نشاط وكميته.", saved: "حُفظ.",
  },
  en: {
    title: "Project reference lists", tabs: "List", roles: "Labour roles", equipment: "Equipment", activities: "Activities and units",
    readOnly: "You cannot change the reference lists; you can only view them. The project manager changes them.",
    direct: "Direct", indirect: "Indirect", category: "Category", name: "Name", add: "Add", save: "Save", edit: "Edit", cancel: "Cancel", stop: "Stop", activate: "Activate", stopped: "Stopped", status: "Status", actions: "Actions",
    noRoles: "No labour roles yet", noRolesLine: "Copy the default list and adjust it, or add your project's roles one by one.", seed: "Copy the default list", seeded: (n: number) => `${n} roles added.`,
    type: "Type", model: "Model", plate: "Plate or size", owner: "Owner", noOwner: "No owner", noEquipment: "No equipment yet", noEquipmentLine: "Add the first machine by its type, or import the equipment list from Excel.", addEquipment: "Add equipment",
    code: "Code", unit: "Unit of measure", total: "Total quantity", units: { villa: "Villa", lm: "Linear metre", m2: "Square metre", piece: "Piece" }, totalNeeded: "A total quantity is required for any unit but villa.",
    noActivities: "No site activities yet", noActivitiesLine: "Activities come from the progress matrix when it is imported; then each one's unit and quantity are set here.", saved: "Saved.",
  },
  ur: {
    title: "پروجیکٹ کی حوالہ فہرستیں", tabs: "فہرست", roles: "مزدوروں کے کردار", equipment: "سازوسامان", activities: "سرگرمیاں اور اکائیاں",
    readOnly: "آپ حوالہ فہرستیں تبدیل نہیں کر سکتے؛ صرف دیکھ سکتے ہیں۔ انہیں پروجیکٹ مینیجر تبدیل کرتا ہے۔",
    direct: "براہِ راست", indirect: "بالواسطہ", category: "زمرہ", name: "نام", add: "شامل کریں", save: "محفوظ کریں", edit: "ترمیم", cancel: "منسوخ کریں", stop: "روکیں", activate: "فعال کریں", stopped: "روکا ہوا", status: "حالت", actions: "اقدامات",
    noRoles: "ابھی مزدوروں کے کردار نہیں", noRolesLine: "پہلے سے طے شدہ فہرست نقل کر کے اس میں ترمیم کریں، یا اپنے کردار ایک ایک کر کے شامل کریں۔", seed: "پہلے سے طے شدہ فہرست نقل کریں", seeded: (n: number) => `${n} کردار شامل ہوئے۔`,
    type: "قسم", model: "ماڈل", plate: "پلیٹ یا سائز", owner: "مالک", noOwner: "کوئی مالک نہیں", noEquipment: "ابھی کوئی سازوسامان نہیں", noEquipmentLine: "پہلی مشین اس کی قسم کے ساتھ شامل کریں، یا Excel سے فہرست درآمد کریں۔", addEquipment: "سازوسامان شامل کریں",
    code: "کوڈ", unit: "پیمائش کی اکائی", total: "کل مقدار", units: { villa: "ولا", lm: "طولی میٹر", m2: "مربع میٹر", piece: "عدد" }, totalNeeded: "ولا کے سوا ہر اکائی کے لیے کل مقدار لازمی ہے۔",
    noActivities: "ابھی سائٹ کی کوئی سرگرمی نہیں", noActivitiesLine: "سرگرمیاں پیش رفت میٹرکس درآمد ہونے پر آتی ہیں؛ پھر ہر ایک کی اکائی اور مقدار یہاں مقرر ہوتی ہے۔", saved: "محفوظ ہو گیا۔",
  },
};
type T = (typeof text)["en"];
type Scope = { tenantId: string; projectId: string };
const MEASURES = ["villa", "lm", "m2", "piece"] as const;
const NONE = "__none";

export function ProjectReferenceLists({ tenantId, projectId }: Scope) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [tab, setTab] = useState("roles");
  const canEdit = useCan("project.manage", projectId);
  // D-84 (b): the Tracker writes the PMC units and their statuses, so it asks the PMC permission the server asks (#236)
  const canImportTracker = useCan("project.pmc.manage", projectId);
  const scope = { tenantId, projectId };
  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6" aria-labelledby="reference-lists-title" data-reference-lists>
      <div className="flex items-center gap-3"><ListChecks className="h-5 w-5 text-primary" aria-hidden="true" /><h2 id="reference-lists-title" className="font-semibold">{t.title}</h2></div>
      <Segmented layout="grid" columns={3} label={t.tabs} value={tab} onValueChange={setTab} options={[{ value: "roles", label: t.roles }, { value: "equipment", label: t.equipment }, { value: "activities", label: t.activities }]} />
      <WriteGate permission="project.manage" projectId={projectId} reason={{ ar: text.ar.readOnly, en: text.en.readOnly, ur: text.ur.readOnly }}>{null}</WriteGate>
      {tab === "roles" ? <Roles scope={scope} t={t} canEdit={canEdit} /> : tab === "equipment" ? <Equipment scope={scope} t={t} canEdit={canEdit} /> : <Activities scope={scope} t={t} canEdit={canEdit} canImport={canImportTracker} />}
    </section>
  );
}

/** A refusal from the server, in the page's language, beside the form that caused it. */
function Refusal({ error }: { error: unknown }) {
  const { isArabic } = useLanguage();
  return error ? <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, isArabic)}</p> : null;
}

function Roles({ scope, t, canEdit }: { scope: Scope; t: T; canEdit: boolean }) {
  const { isArabic, language } = useLanguage();
  const list = trpc.projects.labourRoles.list.useQuery(scope);
  const [draft, setDraft] = useState<{ id?: string; name: string; category: "direct" | "indirect" }>({ name: "", category: "direct" });
  const [notice, setNotice] = useState<string | null>(null);
  const done = (message: string) => { setNotice(message); setDraft({ name: "", category: "direct" }); void list.refetch(); };
  const save = trpc.projects.labourRoles.save.useMutation({ onSuccess: () => done(t.saved) });
  const setActive = trpc.projects.labourRoles.setActive.useMutation({ onSuccess: () => done(t.saved) });
  const seed = trpc.projects.labourRoles.seedDefaults.useMutation({ onSuccess: result => done(t.seeded(result.added)) });
  if (list.isLoading) return <SkeletonRows rows={3} />;
  if (!list.data) return <SectionFailed title={t.roles} error={list.error} isArabic={isArabic} onRetry={() => list.refetch()} retrying={list.isFetching} />;
  const roles = list.data;
  return (
    <div className="space-y-4" data-tab="roles">
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <Refusal error={save.error ?? setActive.error ?? seed.error} />
      {roles.length === 0 ? <EmptyState title={t.noRoles} line={t.noRolesLine} action={canEdit ? <Button onClick={() => seed.mutate({ ...scope, language })} loading={seed.isPending}>{t.seed}</Button> : undefined} /> : (
        (["direct", "indirect"] as const).map(category => (
          <div key={category} className="space-y-2" role="group" aria-label={t[category]}>
            <h3 className="text-sm font-semibold">{t[category]} <span className="font-normal text-muted-foreground">({formatNumber(roles.filter(role => role.category === category && role.active).length)})</span></h3>
            <ul className="divide-y rounded-[var(--radius)] border">{roles.filter(role => role.category === category).map(role => (
              <li key={role.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2" data-role={role.id}>
                <span className={role.active ? "" : "text-muted-foreground line-through"}>{role.name}{role.active ? null : <Badge className="ms-2">{t.stopped}</Badge>}</span>
                {canEdit ? <span className="flex gap-1">
                  <Button variant="ghost" className="min-h-11" onClick={() => { setNotice(null); setDraft({ id: role.id, name: role.name, category: role.category }); }}>{t.edit}</Button>
                  <Button variant="ghost" className="min-h-11" onClick={() => setActive.mutate({ ...scope, id: role.id, active: !role.active })}>{role.active ? t.stop : t.activate}</Button>
                </span> : null}
              </li>
            ))}</ul>
          </div>
        ))
      )}
      {canEdit ? (
        <CheckedForm className="grid gap-3 rounded-[var(--radius)] border bg-muted/40 p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={event => { event.preventDefault(); if (!draft.name.trim()) return; save.mutate({ ...scope, id: draft.id, name: draft.name.trim(), category: draft.category }); }}>
          <Field label={t.name} required>{props => <TextInput {...props} required maxLength={120} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />}</Field>
          <Field label={t.category}>{props => <Select {...props} value={draft.category} onValueChange={value => setDraft(current => ({ ...current, category: value as "direct" | "indirect" }))} options={[{ value: "direct", label: t.direct }, { value: "indirect", label: t.indirect }]} />}</Field>
          <span className="flex gap-2"><Button type="submit" loading={save.isPending}>{draft.id ? t.save : t.add}</Button>{draft.id ? <Button variant="ghost" onClick={() => setDraft({ name: "", category: "direct" })}>{t.cancel}</Button> : null}</span>
        </CheckedForm>
      ) : null}
    </div>
  );
}

type MachineDraft = { id?: string; equipmentType: string; model: string; plateOrSize: string; ownerCompanyId: string };
const blankMachine: MachineDraft = { equipmentType: "", model: "", plateOrSize: "", ownerCompanyId: "" };
function Equipment({ scope, t, canEdit }: { scope: Scope; t: T; canEdit: boolean }) {
  const { isArabic } = useLanguage();
  const list = trpc.projects.equipment.list.useQuery(scope);
  const companies = trpc.projects.companies.list.useQuery(scope);
  const [draft, setDraft] = useState<MachineDraft>(blankMachine);
  const [notice, setNotice] = useState<string | null>(null);
  const done = () => { setNotice(t.saved); setDraft(blankMachine); void list.refetch(); };
  const save = trpc.projects.equipment.save.useMutation({ onSuccess: done });
  const setActive = trpc.projects.equipment.setActive.useMutation({ onSuccess: done });
  if (list.isLoading) return <SkeletonRows rows={3} />;
  if (!list.data) return <SectionFailed title={t.equipment} error={list.error} isArabic={isArabic} onRetry={() => list.refetch()} retrying={list.isFetching} />;
  const owners = (companies.data ?? []).filter(company => company.active);
  const put = (patch: Partial<MachineDraft>) => setDraft(current => ({ ...current, ...patch }));
  return (
    <div className="space-y-4" data-tab="equipment">
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <Refusal error={save.error ?? setActive.error ?? companies.error} />
      {list.data.length === 0 ? <EmptyState title={t.noEquipment} line={t.noEquipmentLine} /> : (
        <TableScroll label={t.equipment}>
          <table className="w-full text-sm"><thead><tr className="text-start text-muted-foreground"><th className="p-2 text-start">{t.type}</th><th className="p-2 text-start">{t.model}</th><th className="p-2 text-start">{t.plate}</th><th className="p-2 text-start">{t.owner}</th><th className="p-2 text-start">{t.status}</th>{canEdit ? <th className="p-2 text-start">{t.actions}</th> : null}</tr></thead>
            <tbody>{list.data.map(machine => (
              <tr key={machine.id} className="border-t" data-machine={machine.id}>
                <td className="p-2">{machine.equipmentType}</td><td className="p-2">{machine.model ?? "—"}</td><td className="p-2" dir="auto">{machine.plateOrSize ?? "—"}</td><td className="p-2">{machine.ownerName ?? "—"}</td>
                <td className="p-2">{machine.active ? "✓" : <Badge>{t.stopped}</Badge>}</td>
                {canEdit ? <td className="p-2"><span className="flex gap-1">
                  <Button variant="ghost" className="min-h-11" onClick={() => { setNotice(null); setDraft({ id: machine.id, equipmentType: machine.equipmentType, model: machine.model ?? "", plateOrSize: machine.plateOrSize ?? "", ownerCompanyId: machine.ownerCompanyId ?? "" }); }}>{t.edit}</Button>
                  <Button variant="ghost" className="min-h-11" onClick={() => setActive.mutate({ ...scope, id: machine.id, active: !machine.active })}>{machine.active ? t.stop : t.activate}</Button>
                </span></td> : null}
              </tr>
            ))}</tbody></table>
        </TableScroll>
      )}
      {canEdit ? (
        <CheckedForm className="grid gap-3 rounded-[var(--radius)] border bg-muted/40 p-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!draft.equipmentType.trim()) return; save.mutate({ ...scope, id: draft.id, equipmentType: draft.equipmentType.trim(), model: draft.model.trim() || null, plateOrSize: draft.plateOrSize.trim() || null, ownerCompanyId: draft.ownerCompanyId || null }); }}>
          <Field label={t.type} required>{props => <TextInput {...props} required maxLength={120} value={draft.equipmentType} onChange={event => put({ equipmentType: event.target.value })} />}</Field>
          <Field label={t.model} optional>{props => <TextInput {...props} maxLength={120} value={draft.model} onChange={event => put({ model: event.target.value })} />}</Field>
          <Field label={t.plate} optional>{props => <TextInput {...props} maxLength={120} dir="auto" value={draft.plateOrSize} onChange={event => put({ plateOrSize: event.target.value })} />}</Field>
          <Field label={t.owner} optional>{props => <Select {...props} value={draft.ownerCompanyId || NONE} onValueChange={value => put({ ownerCompanyId: value === NONE ? "" : value })} options={[{ value: NONE, label: t.noOwner }, ...owners.map(company => ({ value: company.id, label: company.name }))]} />}</Field>
          <span className="flex gap-2 sm:col-span-2"><Button type="submit" loading={save.isPending}>{draft.id ? t.save : t.addEquipment}</Button>{draft.id ? <Button variant="ghost" onClick={() => setDraft(blankMachine)}>{t.cancel}</Button> : null}</span>
        </CheckedForm>
      ) : null}
      {canEdit ? <EquipmentImport tenantId={scope.tenantId} projectId={scope.projectId} onImported={() => { void list.refetch(); }} /> : null}
    </div>
  );
}

function Activities({ scope, t, canEdit, canImport }: { scope: Scope; t: T; canEdit: boolean; canImport: boolean }) {
  const { isArabic } = useLanguage();
  const list = trpc.projects.siteActivities.list.useQuery(scope);
  const [drafts, setDrafts] = useState<Record<string, { measureUnit: (typeof MEASURES)[number]; total: string }>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setMeasure = trpc.projects.siteActivities.setMeasure.useMutation({ onSuccess: result => { setNotice(t.saved); setDrafts(current => { const next = { ...current }; delete next[result.id]; return next; }); void list.refetch(); } });
  if (list.isLoading) return <SkeletonRows rows={3} />;
  if (!list.data) return <SectionFailed title={t.activities} error={list.error} isArabic={isArabic} onRetry={() => list.refetch()} retrying={list.isFetching} />;
  const tracker = canImport ? <TrackerImport tenantId={scope.tenantId} projectId={scope.projectId} onImported={() => { void list.refetch(); }} /> : null;
  // an empty list's next step is the import that fills it
  if (list.data.length === 0) return <div className="space-y-3"><EmptyState title={t.noActivities} line={t.noActivitiesLine} />{tracker}</div>;
  const submit = (id: string) => {
    const draft = drafts[id]; if (!draft) return;
    const total = draft.total.trim() === "" ? null : Number(draft.total);
    if (draft.measureUnit !== "villa" && (total === null || !(total > 0))) { setProblem(id); return; }
    setProblem(null); setNotice(null);
    setMeasure.mutate({ ...scope, siteActivityId: id, measureUnit: draft.measureUnit, totalQuantity: draft.measureUnit === "villa" ? null : total });
  };
  return (
    <div className="space-y-3" data-tab="activities">
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <Refusal error={setMeasure.error} />
      <ul className="divide-y rounded-[var(--radius)] border">{list.data.map(activity => {
        const draft = drafts[activity.id] ?? { measureUnit: activity.measureUnit, total: activity.totalQuantity === null ? "" : String(activity.totalQuantity) };
        const edit = (patch: Partial<typeof draft>) => setDrafts(current => ({ ...current, [activity.id]: { ...draft, ...patch } }));
        return (
          <li key={activity.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[1fr_11rem_10rem_auto] sm:items-end" data-activity={activity.id}>
            <span><span className="block text-xs text-muted-foreground" dir="ltr">{activity.code}</span><span className="font-medium">{activity.name}</span></span>
            <Field label={t.unit}>{props => <Select {...props} disabled={!canEdit} value={draft.measureUnit} onValueChange={value => edit({ measureUnit: value as (typeof MEASURES)[number] })} options={MEASURES.map(unit => ({ value: unit, label: t.units[unit] }))} />}</Field>
            <Field label={t.total} required={draft.measureUnit !== "villa"} error={problem === activity.id ? t.totalNeeded : undefined}>{props => <TextInput {...props} type="number" inputMode="decimal" min="0" step="any" disabled={!canEdit || draft.measureUnit === "villa"} value={draft.measureUnit === "villa" ? "" : draft.total} onChange={event => edit({ total: event.target.value })} />}</Field>
            {canEdit ? <Button className="min-h-11" disabled={!drafts[activity.id]} loading={setMeasure.isPending && setMeasure.variables?.siteActivityId === activity.id} onClick={() => submit(activity.id)}>{t.save}</Button> : null}
          </li>
        );
      })}</ul>
      {tracker}
    </div>
  );
}
