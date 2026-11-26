// Q-67 (2)(3): choosing the villas of a field entry from the project's own data — never a typed code. Five ways (a phase, blocks, a model, a range between two
// existing villas, or villas ticked in a list with its search and filters and «choose all in the filter»), each option with the number of its villas. Under
// the choice: the summary of what the save will do (how many villas, which are left out because their model has no such activity, which would move back).
import React from "react";
import { Button, Checkbox, Field, Segmented, Select, TextInput, formatNumber } from "@/components/ds";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { filterVillas, summarizeSelection, villasOf, type PickerVilla, type SelectionSummary, type VillaChoice } from "@/lib/villaPicker";

type Group = { code: string; villas: number };
export type PickerData = { villas: PickerVilla[]; blocks: Group[]; phases: Group[]; models: Group[] };
const LIST_LIMIT = 400;
const ALL = "__all";

const text = {
  ar: {
    mode: "اختيار الفلل", modes: { phase: "مرحلة", block: "بلوك", model: "نموذج", range: "نطاق", list: "فلل محددة" }, villas: (n: number) => `${formatNumber(n)} فيلا`,
    phase: "المرحلة", block: "البلوكات", model: "النموذج", from: "من فيلا", to: "إلى فيلا", choosePhase: "اختر المرحلة", chooseBlock: "اختر بلوكًا أو أكثر", chooseModel: "اختر النموذج", chooseVilla: "اختر الفيلا",
    search: "ابحث برقم الفيلا", all: "الكل", chooseAll: (n: number) => `اختر الكل ضمن التصفية (${formatNumber(n)})`, clearAll: "إلغاء الكل", more: (n: number) => `و${formatNumber(n)} فيلا أخرى — ضيّق البحث أو التصفية`,
    noPhases: "لا مراحل في سجل الفلل بعد (عمود Phase)", noVillas: "لا فلل في المشروع بعد — استورد سجل الفلل أولًا.",
    chosen: (n: number) => `${formatNumber(n)} فيلا مختارة`, willSave: (n: number) => `سيُحدَّث ${formatNumber(n)}`,
    excluded: (n: number, models: string) => `${formatNumber(n)} مستبعدة لأن البند غير موجود في نموذجها (${models})`, movingBack: (n: number) => `${formatNumber(n)} حالتها الآن أعلى من الحالة الجديدة وستنزل:`,
    villa: "فيلا", status: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<string, string>,
  },
  en: {
    mode: "Choose the villas", modes: { phase: "Phase", block: "Block", model: "Model", range: "Range", list: "Chosen villas" }, villas: (n: number) => `${formatNumber(n)} villas`,
    phase: "Phase", block: "Blocks", model: "Model", from: "From villa", to: "To villa", choosePhase: "Choose the phase", chooseBlock: "Choose one block or more", chooseModel: "Choose the model", chooseVilla: "Choose the villa",
    search: "Search by villa number", all: "All", chooseAll: (n: number) => `Choose all in the filter (${formatNumber(n)})`, clearAll: "Clear all", more: (n: number) => `and ${formatNumber(n)} more villas — narrow the search or the filter`,
    noPhases: "No phases in the villa register yet (the Phase column)", noVillas: "No villas in the project yet — import the villa register first.",
    chosen: (n: number) => `${formatNumber(n)} villas chosen`, willSave: (n: number) => `${formatNumber(n)} will be updated`,
    excluded: (n: number, models: string) => `${formatNumber(n)} left out because their model has no such item (${models})`, movingBack: (n: number) => `${formatNumber(n)} are now at a higher status and will move back:`,
    villa: "Villa", status: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
  },
  ur: {
    mode: "ولاز کا انتخاب", modes: { phase: "مرحلہ", block: "بلاک", model: "ماڈل", range: "رینج", list: "منتخب ولاز" }, villas: (n: number) => `${formatNumber(n)} ولاز`,
    phase: "مرحلہ", block: "بلاکس", model: "ماڈل", from: "ولا سے", to: "ولا تک", choosePhase: "مرحلہ منتخب کریں", chooseBlock: "ایک یا زیادہ بلاک منتخب کریں", chooseModel: "ماڈل منتخب کریں", chooseVilla: "ولا منتخب کریں",
    search: "ولا نمبر سے تلاش کریں", all: "سب", chooseAll: (n: number) => `فلٹر میں سب منتخب کریں (${formatNumber(n)})`, clearAll: "سب صاف کریں", more: (n: number) => `اور ${formatNumber(n)} مزید ولاز — تلاش یا فلٹر محدود کریں`,
    noPhases: "ولا رجسٹر میں ابھی کوئی مرحلہ نہیں (Phase کالم)", noVillas: "منصوبے میں ابھی کوئی ولا نہیں — پہلے ولا رجسٹر درآمد کریں۔",
    chosen: (n: number) => `${formatNumber(n)} ولاز منتخب`, willSave: (n: number) => `${formatNumber(n)} اپ ڈیٹ ہوں گے`,
    excluded: (n: number, models: string) => `${formatNumber(n)} خارج کیونکہ ان کے ماڈل میں یہ آئٹم نہیں (${models})`, movingBack: (n: number) => `${formatNumber(n)} کی حالت اب زیادہ ہے اور نیچے آئے گی:`,
    villa: "ولا", status: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیر جائزہ", COMPLETE: "مکمل" } as Record<string, string>,
  },
};

export type PickerMode = VillaChoice["mode"];
export const emptyChoice = (mode: PickerMode): VillaChoice =>
  mode === "list" ? { mode, villas: [] } : mode === "range" ? { mode, from: "", to: "" } : mode === "block" ? { mode, blocks: [] } : mode === "phase" ? { mode, phases: [] } : { mode, models: [] };

export function VillaPicker({ data, choice, onChoice }: { data: PickerData; choice: VillaChoice; onChoice: (choice: VillaChoice) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const groupOptions = (groups: Group[]): ComboOption[] => groups.map(group => ({ value: group.code, label: group.code, description: t.villas(group.villas) }));
  const villaOptions = React.useMemo<ComboOption[]>(() => data.villas.map(villa => ({ value: villa.villa, label: villa.villa, description: [villa.block, villa.phase, villa.model].filter(Boolean).join(" · ") })), [data.villas]);
  const modes: PickerMode[] = data.phases.length ? ["phase", "block", "model", "range", "list"] : ["block", "model", "range", "list"];
  if (!data.villas.length) return <p className="text-sm text-muted-foreground" data-picker-empty>{t.noVillas}</p>;

  return (
    <div className="flex flex-col gap-3" data-villa-picker={choice.mode}>
      <Segmented label={t.mode} value={choice.mode} onValueChange={value => onChoice(emptyChoice(value as PickerMode))} options={modes.map(mode => ({ value: mode, label: t.modes[mode] }))} />
      {choice.mode === "phase" && <Field label={t.phase} required>{props => <SearchCombobox id={props.id} data-combobox="phase" multiple options={groupOptions(data.phases)} values={choice.phases} onChangeMany={phases => onChoice({ mode: "phase", phases })} placeholder={t.choosePhase} />}</Field>}
      {choice.mode === "block" && <Field label={t.block} required>{props => <SearchCombobox id={props.id} data-combobox="block" multiple options={groupOptions(data.blocks)} values={choice.blocks} onChangeMany={blocks => onChoice({ mode: "block", blocks })} placeholder={t.chooseBlock} />}</Field>}
      {choice.mode === "model" && <Field label={t.model} required>{props => <SearchCombobox id={props.id} data-combobox="model" multiple options={groupOptions(data.models)} values={choice.models} onChangeMany={models => onChoice({ mode: "model", models })} placeholder={t.chooseModel} />}</Field>}
      {choice.mode === "range" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.from} required>{props => <SearchCombobox id={props.id} data-combobox="from" options={villaOptions} value={choice.from} onChange={from => onChoice({ ...choice, from })} placeholder={t.chooseVilla} />}</Field>
          <Field label={t.to} required>{props => <SearchCombobox id={props.id} data-combobox="to" options={villaOptions} value={choice.to} onChange={to => onChoice({ ...choice, to })} placeholder={t.chooseVilla} />}</Field>
        </div>
      )}
      {choice.mode === "list" && <VillaList data={data} chosen={choice.villas} onChosen={villas => onChoice({ mode: "list", villas })} />}
    </div>
  );
}

function VillaList({ data, chosen, onChosen }: { data: PickerData; chosen: string[]; onChosen: (villas: string[]) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [search, setSearch] = React.useState("");
  const [phase, setPhase] = React.useState(ALL); const [block, setBlock] = React.useState(ALL); const [model, setModel] = React.useState(ALL);
  const filtered = React.useMemo(() => filterVillas(data.villas, { search, phase: phase === ALL ? undefined : phase, block: block === ALL ? undefined : block, model: model === ALL ? undefined : model }), [data.villas, search, phase, block, model]);
  const set = React.useMemo(() => new Set(chosen), [chosen]);
  const order = (next: Set<string>) => data.villas.map(villa => villa.villa).filter(villa => next.has(villa));
  const toggle = (villa: string, on: boolean) => { const next = new Set(set); if (on) next.add(villa); else next.delete(villa); onChosen(order(next)); };
  const filterSelect = (label: string, groups: Group[], value: string, onValue: (value: string) => void) => (
    <Field label={label}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...groups.map(group => ({ value: group.code, label: group.code, description: t.villas(group.villas) }))]} value={value} onValueChange={onValue} />}</Field>
  );
  return (
    <div className="flex flex-col gap-3" data-villa-list>
      <Field label={t.search}>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={search} onChange={event => setSearch(event.target.value)} />}</Field>
      <div className="grid grid-cols-3 gap-2">
        {data.phases.length ? filterSelect(t.phase, data.phases, phase, setPhase) : null}
        {filterSelect(t.block, data.blocks, block, setBlock)}
        {filterSelect(t.model, data.models, model, setModel)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" data-choose-all onClick={() => onChosen(order(new Set([...chosen, ...filtered.map(villa => villa.villa)])))} disabled={!filtered.length}>{t.chooseAll(filtered.length)}</Button>
        {chosen.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => onChosen([])}>{t.clearAll}</Button>}
      </div>
      <ul className="grid max-h-80 grid-cols-3 gap-1 overflow-y-auto rounded-md border border-border p-1 sm:grid-cols-4" aria-label={t.modes.list}>
        {filtered.slice(0, LIST_LIMIT).map(villa => (
          <li key={villa.villa}><Checkbox checked={set.has(villa.villa)} onCheckedChange={on => toggle(villa.villa, on)} className="w-full justify-start px-2" aria-label={`${t.villa} ${villa.villa}`}><bdi dir="ltr" className="text-sm">{villa.villa}</bdi></Checkbox></li>
        ))}
      </ul>
      {filtered.length > LIST_LIMIT && <p className="text-xs text-muted-foreground">{t.more(filtered.length - LIST_LIMIT)}</p>}
    </div>
  );
}

/** The summary before the save (Q-67 (3)). */
export function SelectionSummaryNote({ summary }: { summary: SelectionSummary }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  if (!summary.chosen) return null;
  return (
    <div role="status" data-selection-summary className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="font-semibold">{t.chosen(summary.chosen)}{summary.excluded.length ? <> · {t.willSave(summary.applicable.length)}</> : null}</p>
      {summary.excluded.length > 0 && <p data-summary-excluded className="text-warning-soft-foreground">{t.excluded(summary.excluded.length, summary.excludedModels.join(language === "en" ? ", " : "، "))}</p>}
      {summary.movingBack.length > 0 && (
        <p data-summary-moving-back className="text-warning-soft-foreground">{t.movingBack(summary.movingBack.length)} {summary.movingBack.slice(0, 12).map(item => `${item.villa} (${t.status[item.from] ?? item.from})`).join(language === "en" ? ", " : "، ")}{summary.movingBack.length > 12 ? " …" : ""}</p>
      )}
    </div>
  );
}

export { villasOf, summarizeSelection };
