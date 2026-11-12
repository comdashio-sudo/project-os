import React from "react";
import { useParams } from "wouter";
import { Download } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput, formatNumber } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { LabourHistogram } from "./ProjectBaselineLabour";
import { saveBase64File } from "./ProjectBaselineCashFlow";

// Q-11 (b): the residential development planner. The inputs of a project (type, unit models or buildings, working week, risk, crews, sales), a plan computed on the
// server (server/devPlannerService.ts → server/domain/devPlanner.ts): three scenarios in months, the activities of the likely one with its critical path, the monthly
// labour histogram and the sales; and the same plan as an Excel workbook. Nothing is stored.
type Model = { name: string; count: number; bua: number; floors: number; plot: number };
type Building = { name: string; count: number; floors: number; floorArea: number; unitsPerFloor: number; basement: number };
type Kind = "villa" | "townhouse" | "apartments";
const START = {
  villaModels: [{ name: "A", count: 40, bua: 420, floors: 2, plot: 450 }, { name: "B", count: 50, bua: 360, floors: 2, plot: 400 }, { name: "C", count: 30, bua: 300, floors: 2, plot: 350 }] as Model[],
  townhouseModels: [{ name: "A", count: 30, bua: 280, floors: 2, plot: 240 }, { name: "B", count: 70, bua: 250, floors: 2, plot: 200 }] as Model[],
  buildings: [{ name: "A", count: 6, floors: 5, floorArea: 650, unitsPerFloor: 4, basement: 1 }] as Building[],
};
const text = {
  ar: { title: "حاسبة مدد التطوير السكني", intro: "أدخل المشروع فتحسب المنصة المدة بثلاثة سيناريوهات، والمسار الحرج، والعمالة الشهرية، والبيع.", type: "نوع المشروع", types: { villa: "فلل", townhouse: "تاون هاوس", apartments: "عمائر شقق" }, models: "النماذج", name: "الاسم", count: "العدد", bua: "مسطح البناء م²", floors: "الأدوار", plot: "الأرض م²", floorArea: "مسطح الدور م²", perFloor: "شقق/دور", basement: "قبو", add: "إضافة نموذج", days: "أيام العمل/أسبوع", risk: "المخاطرة", risks: { low: "منخفضة", medium: "متوسطة", high: "عالية" }, fronts: "فرق الهيكل", salesPerMonth: "مبيعات/شهر", run: "احسب", running: "جارٍ الحساب…", export: "تصدير Excel", scenarios: "المدة الكلية", min: "الأدنى", likely: "المرجّح", max: "الأقصى", months: (v: number) => `${formatNumber(v, 1)} شهر`, buildStart: "بدء التنفيذ بعد", critical: "المسار الحرج (المرجّح)", crit: "حرج", labour: "العمالة الشهرية المباشرة", peak: "الذروة", sales: "البيع", launch: "إطلاق البيع في الشهر", selling: "مدة البيع", units: "الوحدات", notFeasible: "هدف العمالة أو المدة غير قابل للتحقيق بالمدخلات الحالية." },
  en: { title: "Residential development planner", intro: "Enter the project and the platform computes the duration in three scenarios, the critical path, monthly labour and sales.", type: "Project type", types: { villa: "Villas", townhouse: "Townhouses", apartments: "Apartment buildings" }, models: "Models", name: "Name", count: "Count", bua: "Built-up m²", floors: "Floors", plot: "Plot m²", floorArea: "Floor area m²", perFloor: "Units/floor", basement: "Basement", add: "Add a model", days: "Working days/week", risk: "Risk", risks: { low: "Low", medium: "Medium", high: "High" }, fronts: "Structure crews", salesPerMonth: "Sales/month", run: "Calculate", running: "Calculating…", export: "Export to Excel", scenarios: "Total duration", min: "Min", likely: "Likely", max: "Max", months: (v: number) => `${formatNumber(v, 1)} months`, buildStart: "Construction starts after", critical: "Critical path (likely)", crit: "critical", labour: "Monthly direct labour", peak: "Peak", sales: "Sales", launch: "Sales launch in month", selling: "Selling period", units: "Units", notFeasible: "The labour or duration target cannot be met with these inputs." },
  ur: { title: "رہائشی ترقی کا منصوبہ ساز", intro: "منصوبہ درج کریں، پلیٹ فارم تین منظرناموں میں مدت، اہم راستہ، ماہانہ افرادی قوت اور فروخت نکالتا ہے۔", type: "منصوبے کی قسم", types: { villa: "ولاز", townhouse: "ٹاؤن ہاؤسز", apartments: "اپارٹمنٹ عمارتیں" }, models: "ماڈل", name: "نام", count: "تعداد", bua: "تعمیری رقبہ م²", floors: "منزلیں", plot: "پلاٹ م²", floorArea: "منزل کا رقبہ م²", perFloor: "یونٹ/منزل", basement: "تہہ خانہ", add: "ماڈل شامل کریں", days: "کام کے دن/ہفتہ", risk: "خطرہ", risks: { low: "کم", medium: "درمیانہ", high: "زیادہ" }, fronts: "ڈھانچے کی ٹیمیں", salesPerMonth: "فروخت/ماہ", run: "حساب کریں", running: "حساب ہو رہا ہے…", export: "Excel برآمد", scenarios: "کل مدت", min: "کم از کم", likely: "متوقع", max: "زیادہ سے زیادہ", months: (v: number) => `${formatNumber(v, 1)} ماہ`, buildStart: "تعمیر شروع ہوتی ہے بعد از", critical: "اہم راستہ (متوقع)", crit: "اہم", labour: "ماہانہ براہ راست افرادی قوت", peak: "عروج", sales: "فروخت", launch: "فروخت کا آغاز ماہ", selling: "فروخت کی مدت", units: "یونٹ", notFeasible: "ان اندراجات سے افرادی قوت یا مدت کا ہدف ممکن نہیں۔" },
};
const RISK = { low: 0.85, medium: 0.78, high: 0.7 } as const;
const num = (value: string) => (value.trim() === "" ? 0 : Number(value));

export default function DevPlanner() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { language, isRtl } = useLanguage(); const t = pickLanguage(language, text);
  const [kind, setKind] = React.useState<Kind>("villa");
  const [villas, setVillas] = React.useState(START.villaModels); const [townhouses, setTownhouses] = React.useState(START.townhouseModels); const [buildings, setBuildings] = React.useState(START.buildings);
  const [days, setDays] = React.useState("6"); const [risk, setRisk] = React.useState<keyof typeof RISK>("medium"); const [fronts, setFronts] = React.useState("10"); const [sales, setSales] = React.useState("8");
  const plan = () => ({ type: kind, workingDaysPerWeek: Number(days) as 5 | 6 | 7, risk: RISK[risk], season: true, roads: null, networks: null, villaModels: villas, townhouseModels: townhouses, buildings, labourMode: "fronts" as const, fronts: Math.max(1, Math.round(num(fronts))), cap: 450, targetMonths: 18, salesMode: "offplan" as const, salesPerMonth: Math.max(0.1, num(sales)), launchMultiplier: 1.6 });
  const run = trpc.devPlanner.run.useMutation();
  const exporter = trpc.devPlanner.export.useMutation({ onSuccess: saveBase64File });
  const rows = kind === "villa" ? villas : kind === "townhouse" ? townhouses : buildings;
  const setRows = (next: Array<Model | Building>) => (kind === "villa" ? setVillas(next as Model[]) : kind === "townhouse" ? setTownhouses(next as Model[]) : setBuildings(next as Building[]));
  const columns: Array<[string, string]> = kind === "apartments" ? [["name", t.name], ["count", t.count], ["floors", t.floors], ["floorArea", t.floorArea], ["unitsPerFloor", t.perFloor], ["basement", t.basement]] : [["name", t.name], ["count", t.count], ["bua", t.bua], ["floors", t.floors], ["plot", t.plot]];
  const result = run.data;
  return (
    <PageMain className="py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
        <Card>
          <CardBody>
            <CheckedForm className="space-y-4" onSubmit={event => { event.preventDefault(); run.mutate({ tenantId, plan: plan() }); }}>
              <div className="grid gap-3 sm:grid-cols-5">
                <Field label={t.type}>{props => <Select {...props} className="md:min-h-11" value={kind} onValueChange={value => setKind(value as Kind)} options={(["villa", "townhouse", "apartments"] as const).map(value => ({ value, label: t.types[value] }))} />}</Field>
                <Field label={t.days}>{props => <Select {...props} className="md:min-h-11" value={days} onValueChange={setDays} options={["5", "6", "7"].map(value => ({ value, label: value }))} />}</Field>
                <Field label={t.risk}>{props => <Select {...props} className="md:min-h-11" value={risk} onValueChange={value => setRisk(value as keyof typeof RISK)} options={(["low", "medium", "high"] as const).map(value => ({ value, label: t.risks[value] }))} />}</Field>
                <Field label={t.fronts}>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" type="number" min="1" value={fronts} onChange={event => setFronts(event.target.value)} />}</Field>
                <Field label={t.salesPerMonth}>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" type="number" min="0.1" step="0.1" value={sales} onChange={event => setSales(event.target.value)} />}</Field>
              </div>
              <fieldset><legend className="text-sm font-medium">{t.models}</legend>
                <div className="mt-2 space-y-2" data-testid="planner-models">
                  <div aria-hidden="true" className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-6">{columns.map(([key, label]) => <span key={key}>{label}</span>)}</div>
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                      {columns.map(([key, label]) => <TextInput key={key} aria-label={`${label} ${index + 1}`} placeholder={label} className="md:min-h-11" dir={key === "name" ? undefined : "ltr"} type={key === "name" ? "text" : "number"} value={String((row as Record<string, unknown>)[key])} onChange={event => setRows(rows.map((item, i) => (i === index ? { ...item, [key]: key === "name" ? event.target.value : num(event.target.value) } : item)))} />)}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="secondary" className="mt-2 min-h-11 md:min-h-11" onClick={() => setRows([...rows, { ...rows[rows.length - 1] }])} disabled={rows.length >= 20}>{t.add}</Button>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11 md:min-h-11" loading={run.isPending}>{run.isPending ? t.running : t.run}</Button>
                <Button type="button" variant="secondary" className="min-h-11 md:min-h-11" loading={exporter.isPending} onClick={() => exporter.mutate({ tenantId, plan: plan(), locale: language })}><Download className="me-1 h-4 w-4" />{t.export}</Button>
              </div>
              {run.error || exporter.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(run.error ?? exporter.error, language)}</p> : null}
            </CheckedForm>
          </CardBody>
        </Card>
        {result ? (
          <div className="space-y-4" data-testid="planner-result">
            {!result.labourTargetFeasible ? <p role="status" className="text-sm text-destructive">{t.notFeasible}</p> : null}
            <Card><CardHeader><CardTitle>{t.scenarios}</CardTitle></CardHeader><CardBody>
              <div className="grid gap-3 sm:grid-cols-3">{(["min", "likely", "max"] as const).map(key => <div key={key} className="rounded-[var(--radius)] border border-border p-3"><p className="text-sm text-muted-foreground">{t[key]}</p><p className="text-xl font-semibold">{t.months(result.scenarios[key].totalMonths)}</p><p className="text-xs text-muted-foreground">{t.buildStart} {t.months(result.scenarios[key].buildStartMonths)}</p></div>)}</div>
              <p className="mt-2 text-sm">{t.units}: {formatNumber(result.units)}</p>
            </CardBody></Card>
            <Card><CardHeader><CardTitle>{t.critical}</CardTitle></CardHeader><CardBody>
              <ul className="divide-y divide-border text-sm">{result.activities.filter(a => a.critical).map(a => <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{a.name}</span><span className="text-muted-foreground"><bdi dir="ltr">{formatNumber(a.startMonth, 1)} – {formatNumber(a.finishMonth, 1)}</bdi> <Badge tone="warning">{t.crit}</Badge></span></li>)}</ul>
            </CardBody></Card>
            <Card><CardHeader><CardTitle>{t.labour}</CardTitle></CardHeader><CardBody>
              <LabourHistogram bars={result.labour.months.map((workers, i) => ({ month: `M${i + 1}`, workers }))} label={t.labour} peakLabel={t.peak} />
            </CardBody></Card>
            <Card><CardHeader><CardTitle>{t.sales}</CardTitle></CardHeader><CardBody>
              <p className="text-sm">{t.launch} <bdi dir="ltr">{formatNumber(result.sales.launchMonth, 1)}</bdi> · {t.selling}: {t.months(result.sales.sellingMonths)}</p>
            </CardBody></Card>
          </div>
        ) : null}
      </div>
    </PageMain>
  );
}
