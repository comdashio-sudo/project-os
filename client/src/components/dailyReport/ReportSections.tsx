import React from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds";
import { fieldInput, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// D-46 (2): sections 5 to 8 of the daily report — materials received, HSE, obstacles, the plan for tomorrow — on the server's contract of D-45 (b) (#240).
// Each list is held as typed text and sent whole on every save: the server replaces the four lists of a report with what it receives, so the screen always sends
// all four, empty ones included. A row is checked here only for what the server would refuse (a missing required field, a quantity that is not a number in range).
export const HSE_KINDS = ["meeting", "incident", "near_miss", "violation", "corrective_action"] as const;
export type HseKind = (typeof HSE_KINDS)[number];
export type MaterialRow = { key: string; material: string; quantity: string; unit: string; supplier: string; consultantSubmittalId: string };
export type HseRow = { key: string; kind: HseKind; description: string; peopleCount: string; actionTaken: string };
export type ObstacleRow = { key: string; issue: string; impact: string; responsible: string; action: string; dueDate: string };
export type TomorrowRow = { key: string; area: string; activity: string; quantity: string; unit: string; resources: string };
export type Sections = { materials: MaterialRow[]; hse: HseRow[]; obstacleItems: ObstacleRow[]; tomorrow: TomorrowRow[] };
export const emptySections = (): Sections => ({ materials: [], hse: [], obstacleItems: [], tomorrow: [] });

const key = () => crypto.randomUUID();
const blank = {
  materials: (): MaterialRow => ({ key: key(), material: "", quantity: "", unit: "", supplier: "", consultantSubmittalId: "" }),
  hse: (): HseRow => ({ key: key(), kind: "meeting", description: "", peopleCount: "", actionTaken: "" }),
  obstacleItems: (): ObstacleRow => ({ key: key(), issue: "", impact: "", responsible: "", action: "", dueDate: "" }),
  tomorrow: (): TomorrowRow => ({ key: key(), area: "", activity: "", quantity: "", unit: "", resources: "" }),
};
const num = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? undefined : Number(value));
const opt = (value: string) => value.trim() || undefined;
const s = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

/** The keys of the rows the server would refuse; the save stays off while there is one. */
export function sectionProblems(sections: Sections): string[] {
  const bad = (value: string, test: (n: number) => boolean) => value.trim() !== "" && (num(value) === undefined || !test(num(value)!));
  return [
    ...sections.materials.filter(row => !row.material.trim() || !row.unit.trim() || num(row.quantity) === undefined || num(row.quantity)! <= 0),
    ...sections.hse.filter(row => !row.description.trim() || bad(row.peopleCount, n => Number.isInteger(n) && n >= 0)),
    ...sections.obstacleItems.filter(row => !row.issue.trim()),
    ...sections.tomorrow.filter(row => !row.activity.trim() || bad(row.quantity, n => n >= 0)),
  ].map(row => row.key);
}

/** What the save sends for the four sections (the contract of `siteReports.save`). */
export function sectionsBody(sections: Sections) {
  return {
    materials: sections.materials.map(row => ({ material: row.material.trim(), quantity: num(row.quantity)!, unit: row.unit.trim(), supplier: opt(row.supplier), consultantSubmittalId: row.consultantSubmittalId || undefined })),
    hse: sections.hse.map(row => ({ kind: row.kind, description: row.description.trim(), peopleCount: num(row.peopleCount), actionTaken: opt(row.actionTaken) })),
    obstacleItems: sections.obstacleItems.map(row => ({ issue: row.issue.trim(), impact: opt(row.impact), responsible: opt(row.responsible), action: opt(row.action), dueDate: row.dueDate || undefined })),
    tomorrow: sections.tomorrow.map(row => ({ area: opt(row.area), activity: row.activity.trim(), quantity: num(row.quantity), unit: opt(row.unit), resources: opt(row.resources) })),
  };
}

type Stored = { id: string } & Record<string, unknown>;
/** The four lists of a saved report (`siteReports.get`), back into the screen's rows. */
export function sectionsFrom(full: { materials?: Stored[]; hse?: Stored[]; obstacleItems?: Stored[]; tomorrow?: Stored[] }): Sections {
  return {
    materials: (full.materials ?? []).map(row => ({ key: row.id, material: s(row.material as string), quantity: s(row.quantity as number), unit: s(row.unit as string), supplier: s(row.supplier as string), consultantSubmittalId: s(row.consultantSubmittalId as string) })),
    hse: (full.hse ?? []).map(row => ({ key: row.id, kind: row.kind as HseKind, description: s(row.description as string), peopleCount: s(row.peopleCount as number), actionTaken: s(row.actionTaken as string) })),
    obstacleItems: (full.obstacleItems ?? []).map(row => ({ key: row.id, issue: s(row.issue as string), impact: s(row.impact as string), responsible: s(row.responsible as string), action: s(row.action as string), dueDate: s(row.dueDate as string) })),
    tomorrow: (full.tomorrow ?? []).map(row => ({ key: row.id, area: s(row.area as string), activity: s(row.activity as string), quantity: s(row.quantity as number), unit: s(row.unit as string), resources: s(row.resources as string) })),
  };
}

const text = {
  ar: {
    material: "المادة", quantity: "الكمية", unit: "الوحدة", supplier: "المورد", approval: "اعتماد الاستشاري", noApproval: "بلا اعتماد", addMaterial: "أضف مادة",
    kind: "النوع", description: "الوصف", people: "عدد الأشخاص", actionTaken: "الإجراء المتخذ", addHse: "أضف حدث سلامة",
    kinds: { meeting: "اجتماع توعية", incident: "حادث", near_miss: "حادث وشيك", violation: "مخالفة", corrective_action: "إجراء تصحيحي" },
    issue: "العائق", impact: "الأثر", responsible: "المسؤول", action: "الإجراء", dueDate: "تاريخ الاستحقاق", addObstacle: "أضف عائقًا", freeText: "ملاحظات عامة",
    area: "المنطقة", activity: "النشاط", resources: "الموارد", addPlan: "أضف بندًا للغد", remove: "حذف", none: "لا شيء بعد.",
  },
  en: {
    material: "Material", quantity: "Quantity", unit: "Unit", supplier: "Supplier", approval: "Consultant approval", noApproval: "No approval", addMaterial: "Add material",
    kind: "Kind", description: "Description", people: "People", actionTaken: "Action taken", addHse: "Add safety event",
    kinds: { meeting: "Toolbox meeting", incident: "Incident", near_miss: "Near miss", violation: "Violation", corrective_action: "Corrective action" },
    issue: "Obstacle", impact: "Impact", responsible: "Responsible", action: "Action", dueDate: "Due date", addObstacle: "Add obstacle", freeText: "General notes",
    area: "Area", activity: "Activity", resources: "Resources", addPlan: "Add item for tomorrow", remove: "Remove", none: "Nothing yet.",
  },
  ur: {
    material: "مواد", quantity: "مقدار", unit: "اکائی", supplier: "سپلائر", approval: "کنسلٹنٹ کی منظوری", noApproval: "کوئی منظوری نہیں", addMaterial: "مواد شامل کریں",
    kind: "قسم", description: "تفصیل", people: "افراد کی تعداد", actionTaken: "کیا گیا اقدام", addHse: "حفاظتی واقعہ شامل کریں",
    kinds: { meeting: "حفاظتی میٹنگ", incident: "حادثہ", near_miss: "بال بال بچاؤ", violation: "خلاف ورزی", corrective_action: "اصلاحی اقدام" },
    issue: "رکاوٹ", impact: "اثر", responsible: "ذمہ دار", action: "اقدام", dueDate: "آخری تاریخ", addObstacle: "رکاوٹ شامل کریں", freeText: "عمومی نوٹس",
    area: "علاقہ", activity: "سرگرمی", resources: "وسائل", addPlan: "کل کے لیے آئٹم شامل کریں", remove: "حذف کریں", none: "ابھی کچھ نہیں۔",
  },
};
export const useSectionText = () => pickLanguage(useLanguage().language, text);

const NONE = "__none";
type Field<R> = { name: keyof R & string; label: string; kind?: "text" | "number" | "date" | "area"; required?: boolean; min?: string; step?: string; maxLength?: number; options?: Array<{ value: string; label: string }>; wide?: boolean };

/** One list of a section: a card per row with its fields, a remove button, and an add button under the list. */
function RowList<R extends { key: string }>({ name, rows, fields, onChange, make, addLabel, locked }: { name: string; rows: R[]; fields: Array<Field<R>>; onChange: (rows: R[]) => void; make: () => R; addLabel: string; locked: boolean }) {
  const t = useSectionText();
  const update = (row: R, patch: Partial<R>) => onChange(rows.map(item => (item.key === row.key ? { ...item, ...patch } : item)));
  const input = (row: R, field: Field<R>) => {
    const value = String(row[field.name] ?? "");
    if (field.options) return <Select className="mt-1" value={value || NONE} disabled={locked} onValueChange={next => update(row, { [field.name]: next === NONE ? "" : next } as Partial<R>)} options={field.options} />;
    const common = { className: `${fieldInput} mt-1`, value, disabled: locked, required: field.required, maxLength: field.maxLength };
    if (field.kind === "area") return <textarea {...common} className="mt-1 min-h-[64px] w-full rounded-xl border bg-card p-3 text-base" onChange={event => update(row, { [field.name]: event.target.value } as Partial<R>)} />;
    return <input {...common} type={field.kind ?? "text"} inputMode={field.kind === "number" ? "decimal" : undefined} min={field.min} step={field.step} onChange={event => update(row, { [field.name]: event.target.value } as Partial<R>)} />;
  };
  return (
    <div className="space-y-2" role="group" aria-label={name}>
      {rows.length === 0 && locked && <p className="text-sm text-muted-foreground">{t.none}</p>}
      <ul className="space-y-2">{rows.map(row => (
        <li key={row.key} className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3" data-section-row={name}>
          {fields.map(field => <label key={field.name} className={`block text-sm font-medium ${field.wide === false ? "" : "col-span-2"}`}>{field.label}{input(row, field)}</label>)}
          {!locked && <Button type="button" variant="outline" className={`${tap} col-span-2`} onClick={() => onChange(rows.filter(item => item.key !== row.key))}>{t.remove}</Button>}
        </li>
      ))}</ul>
      {!locked && <Button type="button" variant="outline" className={`${tap} w-full`} onClick={() => onChange([...rows, make()])}>{addLabel}</Button>}
    </div>
  );
}

type Props<K extends keyof Sections> = { title: string; rows: Sections[K]; onChange: (rows: Sections[K]) => void; locked: boolean };
const half = { wide: false } as const;

export function MaterialsSection({ submittals, ...props }: Props<"materials"> & { submittals: Array<{ id: string; submittalNumber: string; title: string }> }) {
  const t = useSectionText();
  return <RowList name={props.title} make={blank.materials} addLabel={t.addMaterial} {...props} fields={[
    { name: "material", label: t.material, required: true, maxLength: 160 },
    { name: "quantity", label: t.quantity, kind: "number", required: true, min: "0", step: "any", ...half },
    { name: "unit", label: t.unit, required: true, maxLength: 24, ...half },
    { name: "supplier", label: t.supplier, maxLength: 160 },
    { name: "consultantSubmittalId", label: t.approval, options: [{ value: NONE, label: t.noApproval }, ...submittals.map(item => ({ value: item.id, label: `${item.submittalNumber} — ${item.title}` }))] },
  ]} />;
}

export function HseSection(props: Props<"hse">) {
  const t = useSectionText();
  return <RowList name={props.title} make={blank.hse} addLabel={t.addHse} {...props} fields={[
    { name: "kind", label: t.kind, options: HSE_KINDS.map(kind => ({ value: kind, label: t.kinds[kind] })), ...half },
    { name: "peopleCount", label: t.people, kind: "number", min: "0", step: "1", ...half },
    { name: "description", label: t.description, kind: "area", required: true, maxLength: 2000 },
    { name: "actionTaken", label: t.actionTaken, maxLength: 2000 },
  ]} />;
}

export function ObstaclesSection(props: Props<"obstacleItems">) {
  const t = useSectionText();
  return <RowList name={props.title} make={blank.obstacleItems} addLabel={t.addObstacle} {...props} fields={[
    { name: "issue", label: t.issue, kind: "area", required: true, maxLength: 2000 },
    { name: "impact", label: t.impact, maxLength: 2000 },
    { name: "responsible", label: t.responsible, maxLength: 160, ...half },
    { name: "dueDate", label: t.dueDate, kind: "date", ...half },
    { name: "action", label: t.action, maxLength: 2000 },
  ]} />;
}

export function TomorrowSection(props: Props<"tomorrow">) {
  const t = useSectionText();
  return <RowList name={props.title} make={blank.tomorrow} addLabel={t.addPlan} {...props} fields={[
    { name: "activity", label: t.activity, required: true, maxLength: 255 },
    { name: "area", label: t.area, maxLength: 160 },
    { name: "quantity", label: t.quantity, kind: "number", min: "0", step: "any", ...half },
    { name: "unit", label: t.unit, maxLength: 24, ...half },
    { name: "resources", label: t.resources, maxLength: 2000 },
  ]} />;
}

/** The HSE section's one-line summary: the count of each kind that occurred, in the kinds' order. */
export function hseSummary(rows: HseRow[], t: ReturnType<typeof useSectionText>) {
  return HSE_KINDS.map(kind => [kind, rows.filter(row => row.kind === kind).length] as const).filter(([, count]) => count > 0).map(([kind, count]) => `${t.kinds[kind]}: ${count}`).join(" · ");
}
