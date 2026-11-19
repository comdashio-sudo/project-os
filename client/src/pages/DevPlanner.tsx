import React from "react";
import { useParams } from "wouter";
import { Download } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput, formatNumber } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { PageGate } from "@/lib/permissions";
import { LabourHistogram } from "./ProjectBaselineLabour";
import { saveBase64File } from "./ProjectBaselineCashFlow";

// Q-11 (b): the residential development planner. The inputs of a project (type, unit models or buildings, working week, risk, crews, sales), a plan computed on the
// server (server/devPlannerService.ts → server/domain/devPlanner.ts): three scenarios in months, the activities of the likely one with its critical path, the monthly
// labour histogram and the sales; and the same plan as an Excel workbook. Nothing is stored.
// Q-34: opened only by who may plan (the server's PLANNING permissions, else the «no permission» page instead of a form the server refuses), each field says what it
// does, «how the duration is calculated» opens the method, and «apply to a project» lists only the projects the person manages (devPlanner.projects).
type Model = { name: string; count: number; bua: number; floors: number; plot: number };
type Building = { name: string; count: number; floors: number; floorArea: number; unitsPerFloor: number; basement: number };
type Kind = "villa" | "townhouse" | "apartments";
const START = {
  villaModels: [{ name: "A", count: 40, bua: 420, floors: 2, plot: 450 }, { name: "B", count: 50, bua: 360, floors: 2, plot: 400 }, { name: "C", count: 30, bua: 300, floors: 2, plot: 350 }] as Model[],
  townhouseModels: [{ name: "A", count: 30, bua: 280, floors: 2, plot: 240 }, { name: "B", count: 70, bua: 250, floors: 2, plot: 200 }] as Model[],
  buildings: [{ name: "A", count: 6, floors: 5, floorArea: 650, unitsPerFloor: 4, basement: 1 }] as Building[],
};
const text = {
  ar: { help: { type: "يحدد المدخلات والأنشطة: الفلل والتاون هاوس بالنماذج، والعمائر بالمباني والأدوار.", days: "تُحوَّل أيام العمل إلى أيام تقويمية: × 7 ÷ أيام العمل × 1.03.", risk: "إنتاجية السيناريو الأقصى من المعدل: منخفضة 85%، متوسطة 78%، عالية 70%. الأدنى 115% والمرجّح 100%.", fronts: "فرق الهيكل الخرساني العاملة في وقت واحد؛ تُوازَن عليها فرق بقية المهن (خط التوازن).", sales: "الوحدات المبيعة شهريًا بعد الإطلاق؛ في أول شهرين × 1.6.", columns: { count: "عدد وحدات هذا النموذج.", bua: "مسطح البناء للوحدة؛ تُقدَّر منه كميات الهيكل والتشطيبات.", floors: "أدوار الوحدة؛ تحدد مسطح الدور ومدة الهيكل الدنيا.", plot: "أرض الوحدة؛ تُقدَّر منها الأسوار والطرق والتشجير.", floorArea: "مسطح الدور الواحد؛ تُقدَّر منه كميات كل دور.", unitsPerFloor: "الشقق في الدور؛ تعطي عدد الوحدات للبيع.", basement: "1 إن كان للمبنى قبو (يضيف السند واللبشة)، وإلا 0." } }, method: "كيف تُحسب المدة", methodSteps: ["ما قبل التنفيذ: الجدوى والتصاميم والرخصة وترخيص البيع على الخارطة والترسية بمدد أدنى ومرجّحة وقصوى، وتطول التصاميم قليلًا للمشاريع الكبيرة. بدء التنفيذ = نهاية الرخصة أو الترسية، أيهما أبعد.", "الكميات: تُقدَّر من المسطحات (مثل الهيكل 0.32 م³ لكل م² بناء في الفلل) ما لم يُرفع BOQ.", "مدة النشاط للوحدة = الكمية ÷ إنتاجية الفرقة اليومية، مضروبة في معامل السيناريو ومعامل الصيف ورمضان للأعمال الخارجية.", "خط التوازن: الوحدات تمر على المهن بالتتابع، وعدد فرق كل مهنة يوازن سرعتها على سرعة الهيكل؛ مدة النشاط كله = (الوحدات − 1) ÷ معدل الإنجاز + مدة الوحدة.", "المسار الحرج: سلسلة الأنشطة التي تحدد موعد التسليم، من التسليم رجوعًا إلى ما قاده.", "العمالة الشهرية = مجموع عمال الأنشطة الجارية في كل شهر (المرجّح). البيع يبدأ بعد ترخيص البيع على الخارطة.", "المرجع: أداة المالك المستقلة، ومثال 120 فيلا مطابق لها ضمن 1% باختبار آلي."], noProjects: "لا مشروع تملك فيه صلاحية إدارة المشروع، فلا يمكن تطبيق الخطة. اطلبها من مدير الشركة.", apply: "تطبيق على مشروع", applyHint: "تُكتب العمالة المخططة الشهرية والتدفق النقدي المخطط (بحسب العمالة، مجموعه 100%) في «ملف المشروع الأساسي» للمشروع المختار، بدءًا من شهر بدء التنفيذ. يستبدل ما كان فيهما.", project: "المشروع", pickProject: "اختر مشروعًا", startMonth: "شهر بدء التنفيذ", applyNow: "تطبيق", applied: "طُبّقت الخطة على ملف المشروع الأساسي.", title: "حاسبة مدد التطوير السكني", intro: "أدخل المشروع فتحسب المنصة المدة بثلاثة سيناريوهات، والمسار الحرج، والعمالة الشهرية، والبيع.", type: "نوع المشروع", types: { villa: "فلل", townhouse: "تاون هاوس", apartments: "عمائر شقق" }, models: "النماذج", name: "الاسم", count: "العدد", bua: "مسطح البناء م²", floors: "الأدوار", plot: "الأرض م²", floorArea: "مسطح الدور م²", perFloor: "شقق/دور", basement: "قبو", add: "إضافة نموذج", days: "أيام العمل/أسبوع", risk: "المخاطرة", risks: { low: "منخفضة", medium: "متوسطة", high: "عالية" }, fronts: "فرق الهيكل", salesPerMonth: "مبيعات/شهر", run: "احسب", running: "جارٍ الحساب…", export: "تصدير Excel", scenarios: "المدة الكلية", min: "الأدنى", likely: "المرجّح", max: "الأقصى", months: (v: number) => `${formatNumber(v, 1)} شهر`, buildStart: "بدء التنفيذ بعد", critical: "المسار الحرج (المرجّح)", crit: "حرج", labour: "العمالة الشهرية المباشرة", peak: "الذروة", sales: "البيع", launch: "إطلاق البيع في الشهر", selling: "مدة البيع", units: "الوحدات", notFeasible: "هدف العمالة أو المدة غير قابل للتحقيق بالمدخلات الحالية." },
  en: { help: { type: "Sets the inputs and activities: villas and townhouses by unit model, apartments by buildings and floors.", days: "Working days become calendar days: × 7 ÷ working days × 1.03.", risk: "Productivity of the max scenario against the norm: low 85%, medium 78%, high 70%. Min is 115%, likely 100%.", fronts: "Concrete-structure crews working at once; the other trades' crews are balanced on them (line of balance).", sales: "Units sold per month after launch; × 1.6 in the first two months.", columns: { count: "Units of this model.", bua: "Built-up area of one unit; structure and finishes quantities are estimated from it.", floors: "Floors of one unit; sets the floor area and the minimum structure time.", plot: "Plot of one unit; fences, roads and landscaping are estimated from it.", floorArea: "Area of one floor; each floor's quantities are estimated from it.", unitsPerFloor: "Apartments per floor; gives the units for sale.", basement: "1 if the building has a basement (adds shoring and the raft), otherwise 0." } }, method: "How the duration is calculated", methodSteps: ["Pre-development: feasibility, design, the building permit, the off-plan sales licence and the award, each with a min, likely and max duration; design takes a little longer for large projects. Construction starts at the later of the permit and the award.", "Quantities: estimated from the areas (e.g. structure 0.32 m³ per m² built-up for villas) unless a BOQ is given.", "An activity's time per unit = quantity ÷ a crew's daily output, times the scenario factor and, for outdoor work, the summer and Ramadan factor.", "Line of balance: units pass through the trades in turn, and each trade's crews are balanced on the structure's pace; an activity overall = (units − 1) ÷ its rate + the time per unit.", "Critical path: the chain of activities that sets the handover date, traced back from handover.", "Monthly labour = the workers of the activities running in each month (likely). Sales start after the off-plan licence.", "Reference: the owner's stand-alone tool; the 120-villa example matches it within 1% in an automated test."], noProjects: "You manage no project here, so the plan cannot be applied. Ask the company administrator for project management.", apply: "Apply to a project", applyHint: "The monthly planned labour and the planned cash flow (labour-weighted, totalling 100%) are written into the chosen project's base file, from the construction start month. It replaces what they held.", project: "Project", pickProject: "Choose a project", startMonth: "Construction start month", applyNow: "Apply", applied: "The plan was applied to the project base file.", title: "Residential development planner", intro: "Enter the project and the platform computes the duration in three scenarios, the critical path, monthly labour and sales.", type: "Project type", types: { villa: "Villas", townhouse: "Townhouses", apartments: "Apartment buildings" }, models: "Models", name: "Name", count: "Count", bua: "Built-up m²", floors: "Floors", plot: "Plot m²", floorArea: "Floor area m²", perFloor: "Units/floor", basement: "Basement", add: "Add a model", days: "Working days/week", risk: "Risk", risks: { low: "Low", medium: "Medium", high: "High" }, fronts: "Structure crews", salesPerMonth: "Sales/month", run: "Calculate", running: "Calculating…", export: "Export to Excel", scenarios: "Total duration", min: "Min", likely: "Likely", max: "Max", months: (v: number) => `${formatNumber(v, 1)} months`, buildStart: "Construction starts after", critical: "Critical path (likely)", crit: "critical", labour: "Monthly direct labour", peak: "Peak", sales: "Sales", launch: "Sales launch in month", selling: "Selling period", units: "Units", notFeasible: "The labour or duration target cannot be met with these inputs." },
  ur: { help: { type: "اندراجات اور سرگرمیاں طے کرتا ہے: ولاز اور ٹاؤن ہاؤسز ماڈل سے، اپارٹمنٹس عمارتوں اور منزلوں سے۔", days: "کام کے دن کیلنڈر دنوں میں بدلتے ہیں: × 7 ÷ کام کے دن × 1.03۔", risk: "زیادہ سے زیادہ منظرنامے کی پیداواریت معمول کے مقابلے: کم 85%، درمیانہ 78%، زیادہ 70%۔ کم از کم 115%، متوقع 100%۔", fronts: "ایک وقت میں کام کرنے والی کنکریٹ ڈھانچے کی ٹیمیں؛ باقی پیشوں کی ٹیمیں ان پر متوازن ہوتی ہیں (لائن آف بیلنس)۔", sales: "لانچ کے بعد ماہانہ فروخت ہونے والے یونٹ؛ پہلے دو مہینوں میں × 1.6۔", columns: { count: "اس ماڈل کے یونٹ۔", bua: "ایک یونٹ کا تعمیری رقبہ؛ ڈھانچے اور فنشنگ کی مقداریں اسی سے۔", floors: "ایک یونٹ کی منزلیں؛ منزل کا رقبہ اور ڈھانچے کا کم از کم وقت۔", plot: "ایک یونٹ کا پلاٹ؛ باڑ، سڑکیں اور شجرکاری اسی سے۔", floorArea: "ایک منزل کا رقبہ؛ ہر منزل کی مقداریں اسی سے۔", unitsPerFloor: "فی منزل اپارٹمنٹ؛ فروخت کے یونٹ دیتا ہے۔", basement: "عمارت میں تہہ خانہ ہو تو 1 (شورنگ اور رافٹ شامل)، ورنہ 0۔" } }, method: "مدت کیسے نکالی جاتی ہے", methodSteps: ["تعمیر سے پہلے: فزیبلٹی، ڈیزائن، تعمیراتی اجازت نامہ، آف پلان فروخت کا لائسنس اور ٹھیکہ، ہر ایک کی کم از کم، متوقع اور زیادہ سے زیادہ مدت؛ بڑے منصوبوں میں ڈیزائن کچھ لمبا۔ تعمیر اجازت نامے یا ٹھیکے میں سے بعد والے پر شروع۔", "مقداریں: رقبوں سے اندازہ (مثلاً ولاز میں ڈھانچہ 0.32 م³ فی م² تعمیر) جب تک BOQ نہ دیا جائے۔", "فی یونٹ سرگرمی کا وقت = مقدار ÷ ٹیم کی یومیہ پیداوار، منظرنامے کے عامل سے ضرب، اور بیرونی کام میں گرمی اور رمضان کا عامل۔", "لائن آف بیلنس: یونٹ باری باری پیشوں سے گزرتے ہیں، ہر پیشے کی ٹیمیں ڈھانچے کی رفتار پر متوازن؛ پوری سرگرمی = (یونٹ − 1) ÷ رفتار + فی یونٹ وقت۔", "اہم راستہ: سرگرمیوں کا وہ سلسلہ جو حوالگی کی تاریخ طے کرتا ہے، حوالگی سے پیچھے کی طرف۔", "ماہانہ افرادی قوت = ہر مہینے جاری سرگرمیوں کے مزدور (متوقع)۔ فروخت آف پلان لائسنس کے بعد شروع۔", "حوالہ: مالک کا علیحدہ ٹول؛ 120 ولاز کی مثال خودکار ٹیسٹ میں 1% کے اندر مطابق۔"], noProjects: "یہاں آپ کسی منصوبے کا انتظام نہیں کرتے، اس لیے منصوبہ لاگو نہیں ہو سکتا۔ کمپنی کے منتظم سے منصوبے کا انتظام مانگیں۔", apply: "منصوبے پر لاگو کریں", applyHint: "ماہانہ منصوبہ بند افرادی قوت اور منصوبہ بند نقد بہاؤ (افرادی قوت کے تناسب سے، مجموعہ 100%) منتخب منصوبے کی بنیادی فائل میں تعمیر کے آغاز کے مہینے سے لکھے جاتے ہیں۔ پہلے والا بدل جاتا ہے۔", project: "منصوبہ", pickProject: "منصوبہ منتخب کریں", startMonth: "تعمیر کے آغاز کا مہینہ", applyNow: "لاگو کریں", applied: "منصوبہ بنیادی فائل پر لاگو ہو گیا۔", title: "رہائشی ترقی کا منصوبہ ساز", intro: "منصوبہ درج کریں، پلیٹ فارم تین منظرناموں میں مدت، اہم راستہ، ماہانہ افرادی قوت اور فروخت نکالتا ہے۔", type: "منصوبے کی قسم", types: { villa: "ولاز", townhouse: "ٹاؤن ہاؤسز", apartments: "اپارٹمنٹ عمارتیں" }, models: "ماڈل", name: "نام", count: "تعداد", bua: "تعمیری رقبہ م²", floors: "منزلیں", plot: "پلاٹ م²", floorArea: "منزل کا رقبہ م²", perFloor: "یونٹ/منزل", basement: "تہہ خانہ", add: "ماڈل شامل کریں", days: "کام کے دن/ہفتہ", risk: "خطرہ", risks: { low: "کم", medium: "درمیانہ", high: "زیادہ" }, fronts: "ڈھانچے کی ٹیمیں", salesPerMonth: "فروخت/ماہ", run: "حساب کریں", running: "حساب ہو رہا ہے…", export: "Excel برآمد", scenarios: "کل مدت", min: "کم از کم", likely: "متوقع", max: "زیادہ سے زیادہ", months: (v: number) => `${formatNumber(v, 1)} ماہ`, buildStart: "تعمیر شروع ہوتی ہے بعد از", critical: "اہم راستہ (متوقع)", crit: "اہم", labour: "ماہانہ براہ راست افرادی قوت", peak: "عروج", sales: "فروخت", launch: "فروخت کا آغاز ماہ", selling: "فروخت کی مدت", units: "یونٹ", notFeasible: "ان اندراجات سے افرادی قوت یا مدت کا ہدف ممکن نہیں۔" },
};
const RISK = { low: 0.85, medium: 0.78, high: 0.7 } as const;
const num = (value: string) => (value.trim() === "" ? 0 : Number(value));

const PLANNING = ["project.schedule.manage", "project.manage", "project.pmc.manage"] as const;

export default function DevPlanner() {
  return <PageGate permission={PLANNING}><Planner /></PageGate>;
}

function Planner() {
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
  // asked for only once there is a plan to apply
  const projects = trpc.devPlanner.projects.useQuery({ tenantId }, { enabled: Boolean(result) });
  const [projectId, setProjectId] = React.useState(""); const [start, setStart] = React.useState("");
  const apply = trpc.devPlanner.applyToProject.useMutation();
  return (
    <PageMain className="py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
        <Card>
          <CardBody>
            <CheckedForm className="space-y-4" onSubmit={event => { event.preventDefault(); run.mutate({ tenantId, plan: plan() }); }}>
              <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Field label={t.type} hint={t.help.type}>{props => <Select {...props} className="md:min-h-11" value={kind} onValueChange={value => setKind(value as Kind)} options={(["villa", "townhouse", "apartments"] as const).map(value => ({ value, label: t.types[value] }))} />}</Field>
                <Field label={t.days} hint={t.help.days}>{props => <Select {...props} className="md:min-h-11" value={days} onValueChange={setDays} options={["5", "6", "7"].map(value => ({ value, label: value }))} />}</Field>
                <Field label={t.risk} hint={t.help.risk}>{props => <Select {...props} className="md:min-h-11" value={risk} onValueChange={value => setRisk(value as keyof typeof RISK)} options={(["low", "medium", "high"] as const).map(value => ({ value, label: t.risks[value] }))} />}</Field>
                <Field label={t.fronts} hint={t.help.fronts}>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" type="number" min="1" value={fronts} onChange={event => setFronts(event.target.value)} />}</Field>
                <Field label={t.salesPerMonth} hint={t.help.sales}>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" type="number" min="0.1" step="0.1" value={sales} onChange={event => setSales(event.target.value)} />}</Field>
              </div>
              <fieldset><legend className="text-sm font-medium">{t.models}</legend>
                <div className="mt-2 space-y-2" data-testid="planner-models">
                  <div aria-hidden="true" className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-6">{columns.map(([key, label]) => <span key={key}>{label}</span>)}</div>
                  {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                      {columns.map(([key, label]) => <label key={key} className="flex flex-col gap-1"><span aria-hidden="true" className="text-xs text-muted-foreground sm:hidden">{label}</span><TextInput aria-label={`${label} ${index + 1}`} placeholder={label} className="md:min-h-11" dir={key === "name" ? undefined : "ltr"} type={key === "name" ? "text" : "number"} value={String((row as Record<string, unknown>)[key])} onChange={event => setRows(rows.map((item, i) => (i === index ? { ...item, [key]: key === "name" ? event.target.value : num(event.target.value) } : item)))} /></label>)}
                    </div>
                  ))}
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2" data-testid="planner-column-help">{columns.filter(([key]) => key !== "name").map(([key, label]) => <div key={key} className="flex gap-1"><dt className="font-medium text-foreground">{label}:</dt><dd>{t.help.columns[key as keyof typeof t.help.columns]}</dd></div>)}</dl>
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
        <details className="rounded-[var(--radius-lg)] border border-border bg-card px-4" data-testid="planner-method">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{t.method}</summary>
          <ol className="list-decimal space-y-1.5 pb-4 ps-5 text-sm text-muted-foreground">{t.methodSteps.map(step => <li key={step}>{step}</li>)}</ol>
        </details>
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
            <Card><CardHeader><CardTitle>{t.apply}</CardTitle></CardHeader><CardBody>
              <p className="text-sm text-muted-foreground">{t.applyHint}</p>
              <SourceNotice query={projects} isArabic={language === "ar"} title={t.project} className="mt-2" />
              {projects.data && projects.data.length === 0 ? <p role="note" data-testid="planner-no-projects" className="mt-3 text-sm text-muted-foreground">{t.noProjects}</p> : <CheckedForm className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={event => { event.preventDefault(); apply.mutate({ tenantId, projectId, plan: plan(), constructionStart: start }); }}>
                <Field label={t.project} required>{props => <Select {...props} className="md:min-h-11" placeholder={t.pickProject} value={projectId || undefined} onValueChange={setProjectId} options={(projects.data ?? []).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />}</Field>
                <Field label={t.startMonth} required>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" type="month" required value={start} onChange={event => setStart(event.target.value)} />}</Field>
                <Button type="submit" className="min-h-11 md:min-h-11" loading={apply.isPending} disabled={!projectId || !start}>{t.applyNow}</Button>
              </CheckedForm>}
              {apply.error ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{getLocalizedProjectError(apply.error, language)}</p> : null}
              {apply.isSuccess ? <p role="status" className="mt-2 text-sm text-success">{t.applied}</p> : null}
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
