// Q-9 (b) / D-46 on the D-45 (a) contract: the header's wind and working hours (section 0), the labour matrix — company × trade × shift → headcount (section 1) —
// and the equipment of the day — machine → count and hours (section 2). The lists come from the project's own reference lists (active entries only); the server
// checks every id belongs to this project and computes the totals. A list that failed to load is never sent, because the server replaces a list that is sent.
import React from "react";
import { fieldInput } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { Select } from "@/components/ds";

export const WIND = ["calm", "light", "moderate", "strong"] as const;
const NONE = "__none";
export type Shift = "day" | "night";
// headcount per «company|role|shift»; the text the person typed, read on save
export type LabourCells = Record<string, string>;
export type EquipmentRows = Record<string, { count: string; hours: string }>;
type Company = { id: string; name: string; active: boolean };
type Role = { id: string; name: string; active: boolean };
type Machine = { id: string; equipmentType: string; model: string | null; plateOrSize: string | null; active: boolean };

const text = {
  ar: {
    wind: "الرياح", windName: { calm: "ساكنة", light: "خفيفة", moderate: "معتدلة", strong: "قوية" }, workHours: "ساعات العمل",
    matrix: "مصفوفة العمالة (الشركة × المهنة × الوردية)", day: "نهار", night: "ليل", noCompanies: "لا شركات في المشروع بعد؛ يضيفها مدير المشروع من «بيانات المشروع».",
    addTrade: "إضافة مهنة", pickTrade: "اختر المهنة", removeTrade: "حذف", total: (n: number) => `المجموع: ${n} عاملًا`, badCount: "العدد عدد صحيح من صفر فأكثر.",
    dayEquipment: "معدات اليوم", count: "العدد", hours: "الساعات", badMachine: "العدد صحيح من 1، والساعات من 0 إلى 24.",
    copy: "انسخ من أمس", copyHint: "ينشئ تقرير هذا اليوم من آخر تقرير لك: العمالة والمعدات وخطة الغد.",
  },
  en: {
    wind: "Wind", windName: { calm: "Calm", light: "Light", moderate: "Moderate", strong: "Strong" }, workHours: "Working hours",
    matrix: "Labour matrix (company × trade × shift)", day: "Day", night: "Night", noCompanies: "The project has no companies yet; the project manager adds them under Project details.",
    addTrade: "Add a trade", pickTrade: "Choose the trade", removeTrade: "Remove", total: (n: number) => `Total: ${n} workers`, badCount: "A count is a whole number from zero.",
    dayEquipment: "Equipment of the day", count: "Count", hours: "Hours", badMachine: "The count is a whole number from 1, and hours are 0 to 24.",
    copy: "Copy from yesterday", copyHint: "Creates this day's report from your last one: labour, equipment and the plan for tomorrow.",
  },
  ur: {
    wind: "ہوا", windName: { calm: "ساکن", light: "ہلکی", moderate: "معتدل", strong: "تیز" }, workHours: "کام کے گھنٹے",
    matrix: "لیبر میٹرکس (کمپنی × پیشہ × شفٹ)", day: "دن", night: "رات", noCompanies: "منصوبے میں ابھی کوئی کمپنی نہیں؛ پروجیکٹ مینیجر انہیں «منصوبے کی تفصیلات» سے شامل کرتا ہے۔",
    addTrade: "پیشہ شامل کریں", pickTrade: "پیشہ منتخب کریں", removeTrade: "ہٹائیں", total: (n: number) => `کل: ${n} مزدور`, badCount: "تعداد صفر یا اس سے زیادہ پورا عدد ہو۔",
    dayEquipment: "آج کا سامان", count: "تعداد", hours: "گھنٹے", badMachine: "تعداد 1 سے پورا عدد، اور گھنٹے 0 سے 24۔",
    copy: "کل سے نقل کریں", copyHint: "آپ کی آخری رپورٹ سے آج کی رپورٹ بناتا ہے: لیبر، سامان اور کل کا منصوبہ۔",
  },
};
export const useCoreText = () => pickLanguage(useLanguage().language, text);

export const cellKey = (companyId: string, roleId: string, shift: Shift) => `${companyId}|${roleId}|${shift}`;
const wholeFromZero = (value: string) => /^\d+$/.test(value.trim());
const machineOk = (row: { count: string; hours: string }) => (row.count.trim() === "" && row.hours.trim() === "") || (/^\d+$/.test(row.count.trim()) && Number(row.count) >= 1 && (row.hours.trim() === "" || (Number.isFinite(Number(row.hours)) && Number(row.hours) >= 0 && Number(row.hours) <= 24)));

export const labourProblems = (cells: LabourCells) => Object.entries(cells).filter(([, value]) => value.trim() !== "" && !wholeFromZero(value)).map(([key]) => key);
export const equipmentProblems = (rows: EquipmentRows) => Object.entries(rows).filter(([, row]) => !machineOk(row)).map(([key]) => key);
export const labourTotal = (cells: LabourCells) => Object.values(cells).reduce((sum, value) => sum + (wholeFromZero(value) ? Number(value) : 0), 0);

/** What the save sends: the cells with a count above zero (an empty or zero cell is no row). */
export function labourBody(cells: LabourCells) {
  return Object.entries(cells).flatMap(([key, value]) => {
    if (!wholeFromZero(value) || Number(value) === 0) return [];
    const [companyId, labourRoleId, shift] = key.split("|") as [string, string, Shift];
    return [{ companyId, labourRoleId, shift, headcount: Number(value) }];
  });
}
export function equipmentBody(rows: EquipmentRows) {
  return Object.entries(rows).flatMap(([equipmentId, row]) => (row.count.trim() === "" ? [] : [{ equipmentId, count: Number(row.count), hours: row.hours.trim() === "" ? undefined : Number(row.hours) }]));
}
export function labourFrom(rows: Array<{ companyId: string; labourRoleId: string; shift: string; headcount: number }>): LabourCells {
  return Object.fromEntries(rows.map(row => [cellKey(row.companyId, row.labourRoleId, row.shift as Shift), String(row.headcount)]));
}
export function equipmentFrom(rows: Array<{ equipmentId: string; count: number; hours: number | null }>): EquipmentRows {
  return Object.fromEntries(rows.map(row => [row.equipmentId, { count: String(row.count), hours: row.hours === null ? "" : String(row.hours) }]));
}

export function HeaderExtras({ wind, workHours, onWind, onHours, locked }: { wind: string; workHours: string; onWind: (value: string) => void; onHours: (value: string) => void; locked: boolean }) {
  const t = useCoreText();
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-sm font-medium">{t.wind}
        <Select className="mt-1" value={wind || NONE} disabled={locked} onValueChange={value => onWind(value === NONE ? "" : value)} options={[{ value: NONE, label: "—" }, ...WIND.map(value => ({ value, label: t.windName[value] }))]} /></label>
      <label className="block text-sm font-medium">{t.workHours}<input className={`${fieldInput} mt-1`} type="number" inputMode="decimal" min="0" max="24" step="any" value={workHours} disabled={locked} onChange={event => onHours(event.target.value)} /></label>
    </div>
  );
}

export function LabourMatrix({ companies, roles, cells, onChange, locked }: { companies: Company[]; roles: Role[]; cells: LabourCells; onChange: (cells: LabourCells) => void; locked: boolean }) {
  const t = useCoreText();
  const active = companies.filter(company => company.active);
  const trades = roles.filter(role => role.active);
  const set = (key: string, value: string) => onChange({ ...cells, [key]: value });
  // a project's trade list is long (the default has dozens): each company shows the trades it has a cell for, and the person adds the others one by one
  const shown = (companyId: string) => trades.filter(role => (["day", "night"] as const).some(shift => cellKey(companyId, role.id, shift) in cells));
  const add = (companyId: string, roleId: string) => onChange({ ...cells, [cellKey(companyId, roleId, "day")]: cells[cellKey(companyId, roleId, "day")] ?? "" });
  const remove = (companyId: string, roleId: string) => { const next = { ...cells }; for (const shift of ["day", "night"] as const) delete next[cellKey(companyId, roleId, shift)]; onChange(next); };
  return (
    <div className="space-y-3" data-labour-matrix>
      <p className="text-sm font-medium">{t.matrix}</p>
      {active.length === 0 ? <p className="text-sm text-muted-foreground">{t.noCompanies}</p> : active.map(company => (
        <fieldset key={company.id} className="space-y-2 rounded-lg border p-2" data-company={company.id}>
          <legend className="px-1 text-sm font-semibold">{company.name}</legend>
          {shown(company.id).map(role => (
            <div key={role.id} className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] items-end gap-2">
              <span className="pb-3 text-sm">{role.name}</span>
              {(["day", "night"] as const).map(shift => {
                const key = cellKey(company.id, role.id, shift);
                const bad = labourProblems({ [key]: cells[key] ?? "" }).length > 0;
                return (
                  <label key={shift} className="block text-xs">{t[shift]}
                    <input className={`${fieldInput} mt-1 ${bad ? "border-danger" : ""}`} aria-label={`${company.name} · ${role.name} · ${t[shift]}`} aria-invalid={bad || undefined} type="number" inputMode="numeric" min="0" step="1" value={cells[key] ?? ""} disabled={locked} onChange={event => set(key, event.target.value)} />
                  </label>
                );
              })}
              {!locked ? <button type="button" className="min-h-[44px] rounded-lg border px-2 text-xs" aria-label={`${t.removeTrade}: ${company.name} · ${role.name}`} onClick={() => remove(company.id, role.id)}>×</button> : <span />}
            </div>
          ))}
          {!locked && trades.length > shown(company.id).length ? (
            <label className="block text-xs">{t.addTrade}
              <Select className="mt-1" value={NONE} aria-label={`${t.addTrade}: ${company.name}`} onValueChange={value => { if (value !== NONE) add(company.id, value); }}
                options={[{ value: NONE, label: t.pickTrade }, ...trades.filter(role => !shown(company.id).includes(role)).map(role => ({ value: role.id, label: role.name }))]} />
            </label>
          ) : null}
        </fieldset>
      ))}
      {labourProblems(cells).length > 0 && <p role="alert" className="text-sm text-danger-soft-foreground">{t.badCount}</p>}
      <p className="text-sm font-semibold" data-labour-total>{t.total(labourTotal(cells))}</p>
    </div>
  );
}

export function EquipmentOfDay({ machines, rows, onChange, locked }: { machines: Machine[]; rows: EquipmentRows; onChange: (rows: EquipmentRows) => void; locked: boolean }) {
  const t = useCoreText();
  const set = (id: string, patch: Partial<{ count: string; hours: string }>) => onChange({ ...rows, [id]: { ...(rows[id] ?? { count: "", hours: "" }), ...patch } });
  const active = machines.filter(machine => machine.active);
  if (active.length === 0) return null;
  return (
    <div className="space-y-2" data-day-equipment>
      <p className="text-sm font-medium">{t.dayEquipment}</p>
      {active.map(machine => {
        const name = [machine.equipmentType, machine.model, machine.plateOrSize].filter(Boolean).join(" · ");
        const row = rows[machine.id] ?? { count: "", hours: "" };
        return (
          <div key={machine.id} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
            <span className="pb-3 text-sm">{name}</span>
            <label className="block text-xs">{t.count}<input className={`${fieldInput} mt-1`} aria-label={`${name} · ${t.count}`} type="number" inputMode="numeric" min="1" step="1" value={row.count} disabled={locked} onChange={event => set(machine.id, { count: event.target.value })} /></label>
            <label className="block text-xs">{t.hours}<input className={`${fieldInput} mt-1`} aria-label={`${name} · ${t.hours}`} type="number" inputMode="decimal" min="0" max="24" step="any" value={row.hours} disabled={locked} onChange={event => set(machine.id, { hours: event.target.value })} /></label>
          </div>
        );
      })}
      {equipmentProblems(rows).length > 0 && <p role="alert" className="text-sm text-danger-soft-foreground">{t.badMachine}</p>}
    </div>
  );
}
