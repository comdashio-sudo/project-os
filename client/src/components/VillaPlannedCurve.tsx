// Q-61 (4): on the live schedule screen, the planned S-curve from the P6 baseline and the weights (schedule.plannedCurve, server/plannedCurveService.ts) — for
// the project, a block or a model — with today's planned percentage against the site's actual, and the villas behind plan. Everything shown is what the
// server returned; nothing is computed here. Not drawn, with the reason, until there is a baseline and every weighted group is linked (the section above).
// Hidden for someone without project.pmc.read; a failed read says so.
import React, { useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardBody, CardHeader, CardTitle, Select } from "@/components/ds";
import { ChartLegend } from "@/components/ChartLegend";
import { formatNumber, formatPercent } from "@/components/ds/format";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";

const text = {
  ar: { title: "المنحنى المخطط لكل فيلا (من خط أساس P6 والأوزان)", noBaseline: "لا خط أساس بعد: يُنشأ عند أول استيراد P6 مؤكَّد.", incomplete: "لا يُحسب المنحنى قبل ربط كل مجموعة وزنها أكبر من صفر بمراحل الجدول (القسم أعلاه). غير المربوطة:", stale: "مراحل مربوطة لم تعد في الجدول:", scope: "عرض", project: "المشروع كله", block: "البلوك", model: "النموذج", plannedNow: "المخطط اليوم", actualNow: "الفعلي اليوم (سجل الموقع)", noActual: "لا سجل موقع بعد", behindCount: "فلل متأخرة عن المخطط", planned: "المخطط التراكمي", behind: "الفلل المتأخرة عن المخطط اليوم", villa: "الفيلا", gap: "الفرق", none: "لا فيلا متأخرة عن المخطط.", gaps: "فلل ينقصها في الجدول نشاط لمجموعة موزونة:", without: "فلل المشروع بلا أنشطة في خط الأساس:", baseline: "خط الأساس" },
  en: { title: "Planned curve per villa (from the P6 baseline and the weights)", noBaseline: "No baseline yet: it is made by the first confirmed P6 import.", incomplete: "The curve is not computed until every group with a weight above zero is linked to schedule stages (the section above). Not linked:", stale: "Linked stages no longer in the schedule:", scope: "Show", project: "The whole project", block: "Block", model: "Model", plannedNow: "Planned today", actualNow: "Actual today (site record)", noActual: "No site record yet", behindCount: "Villas behind plan", planned: "Planned (cumulative)", behind: "Villas behind plan today", villa: "Villa", gap: "Gap", none: "No villa is behind plan.", gaps: "Villas whose schedule lacks an activity for a weighted group:", without: "The project's villas with no activity in the baseline:", baseline: "Baseline" },
  ur: { title: "ہر ولا کا منصوبہ بند منحنی (P6 بنیادی منصوبے اور اوزان سے)", noBaseline: "ابھی کوئی بنیادی منصوبہ نہیں: یہ پہلی تصدیق شدہ P6 درآمد سے بنتا ہے۔", incomplete: "منحنی کا حساب اس وقت تک نہیں ہوتا جب تک صفر سے زیادہ وزن والا ہر گروپ شیڈول کے مراحل سے نہ جڑے (اوپر والا حصہ)۔ غیر مربوط:", stale: "مربوط مراحل جو اب شیڈول میں نہیں:", scope: "دکھائیں", project: "پورا منصوبہ", block: "بلاک", model: "ماڈل", plannedNow: "آج منصوبہ بند", actualNow: "آج اصل (سائٹ ریکارڈ)", noActual: "ابھی سائٹ ریکارڈ نہیں", behindCount: "منصوبے سے پیچھے ولاز", planned: "منصوبہ بند (مجموعی)", behind: "آج منصوبے سے پیچھے ولاز", villa: "ولا", gap: "فرق", none: "کوئی ولا منصوبے سے پیچھے نہیں۔", gaps: "وہ ولاز جن کے شیڈول میں کسی وزنی گروپ کی سرگرمی نہیں:", without: "منصوبے کی وہ ولاز جن کی بنیادی منصوبے میں کوئی سرگرمی نہیں:", baseline: "بنیادی منصوبہ" },
};
const pct = (value: number | null) => (value === null ? "—" : formatPercent(value, 1));

export function VillaPlannedCurve({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canRead = useCan("project.pmc.read", projectId);
  const query = trpc.schedule.plannedCurve.useQuery({ tenantId, projectId }, { enabled: canRead, retry: false });
  const [scope, setScope] = useState("project");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const data = query.data;
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(260, Math.floor(entries[0].contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [data?.ready]);
  if (!canRead) return null;
  if (query.error) return <Card data-planned-curve><CardHeader><CardTitle>{t.title}</CardTitle></CardHeader><CardBody><SourceNotice query={query} isArabic={language === "ar"} title={t.title} /></CardBody></Card>;
  if (!data) return null;

  if (!data.ready) return <Card data-planned-curve data-planned-curve-reason={data.reason}>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardBody className="flex flex-col gap-2 text-sm">
      {data.reason === "NO_BASELINE" ? <p>{t.noBaseline}</p> : <>
        {data.readiness.unlinked.length ? <p>{t.incomplete} <bdi dir="ltr">{data.readiness.unlinked.join(", ")}</bdi></p> : null}
        {data.readiness.stale.length ? <p className="text-destructive">{t.stale} {data.readiness.stale.map(item => <bdi key={item.groupCode} dir="ltr" className="me-2">{item.groupCode} ← {item.stageCodes.join("+")}</bdi>)}</p> : null}
      </>}
    </CardBody>
  </Card>;

  const options = [{ value: "project", label: t.project }, ...data.blocks.map(row => ({ value: `block:${row.key}`, label: `${t.block} ${row.key}` })), ...data.models.map(row => ({ value: `model:${row.key}`, label: `${t.model} ${row.key}` }))];
  const curve = scope === "project" ? data.project : scope.startsWith("block:") ? data.blocks.find(row => `block:${row.key}` === scope)?.curve ?? [] : data.models.find(row => `model:${row.key}` === scope)?.curve ?? [];
  const metric = (key: string, label: string, value: string, tone?: "danger") => <div key={key} className="rounded-xl border p-3" data-metric={key}><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-semibold ${tone === "danger" ? "text-destructive" : ""}`}><bdi dir="ltr">{value}</bdi></p></div>;

  return <Card data-planned-curve>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardBody className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {metric("planned", t.plannedNow, pct(data.projectNow))}
        {metric("actual", t.actualNow, data.projectActual === null ? t.noActual : pct(data.projectActual))}
        {metric("behind", t.behindCount, String(data.behind.length), data.behind.length ? "danger" : undefined)}
      </div>
      <div className="sm:w-72"><Select aria-label={t.scope} value={scope} onValueChange={setScope} options={options} /></div>
      <div ref={box} data-planned-chart>
        <div style={{ direction: "ltr" }}>
          <LineChart width={width} height={260} data={curve} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} unit="%" width={52} />
            <Tooltip />
            <Legend content={<ChartLegend />} />
            <Line type="linear" dataKey="planned" name={t.planned} stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">{t.behind}</div>
        {data.behind.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.behind}>
          <table className="w-full min-w-[28rem] text-sm" data-behind-rows>
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start">{t.villa}</th><th className="p-2 text-start">{t.block}</th><th className="p-2 text-start">{t.model}</th><th className="p-2 text-start">{t.plannedNow}</th><th className="p-2 text-start">{t.actualNow}</th><th className="p-2 text-start">{t.gap}</th></tr></thead>
            <tbody>{data.behind.slice(0, 50).map(row => <tr key={row.unitNumber} className="border-b" data-behind={row.unitNumber}>
              <td className="p-2 font-medium"><bdi dir="ltr">{row.unitNumber}</bdi></td><td className="p-2"><bdi dir="ltr">{row.blockCode}</bdi></td><td className="p-2"><bdi dir="ltr">{row.modelCode}</bdi></td>
              <td className="p-2"><bdi dir="ltr">{pct(row.plannedNow)}</bdi></td><td className="p-2"><bdi dir="ltr">{pct(row.actual)}</bdi></td><td className="p-2 font-semibold text-destructive"><bdi dir="ltr">{formatNumber(row.gap, 1)}</bdi></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      {data.gaps.length ? <p className="text-xs text-warning-soft-foreground" data-curve-gaps>{t.gaps} {data.gaps.slice(0, 20).map(item => <Badge key={item.unitNumber} tone="warning" className="me-1"><bdi dir="ltr">{item.unitNumber}: {item.groupCodes.join(", ")}</bdi></Badge>)}</p> : null}
      {data.villasWithoutActivities.length ? <p className="text-xs text-muted-foreground">{t.without} <bdi dir="ltr">{data.villasWithoutActivities.slice(0, 20).join(", ")}{data.villasWithoutActivities.length > 20 ? ` (+${data.villasWithoutActivities.length - 20})` : ""}</bdi></p> : null}
    </CardBody>
  </Card>;
}
