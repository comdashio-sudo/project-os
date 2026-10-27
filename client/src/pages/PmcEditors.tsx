import React from "react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Select, formatNumber, formatPercent } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate, useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

// Work order 21, the PMC table editors: units created in bulk for a block and a model; a model's activity weights edited together with a
// counter that must reach exactly 100% before they can be saved (rule 4); and a units-by-activities grid where a click moves a cell to its next
// status (the same server write as everywhere else: quality gate, history, EVM). Server: server/pmcEditorService.ts.
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"] as const;
type Status = (typeof STATUSES)[number];
const next = (status: Status): Status => STATUSES[(STATUSES.indexOf(status) + 1) % STATUSES.length];
const TONE: Record<Status, string> = { NOT_STARTED: "bg-muted text-muted-foreground", IN_PROGRESS: "bg-warning-soft text-warning-soft-foreground", UNDER_REVIEW: "bg-info-soft text-info-soft-foreground", COMPLETE: "bg-success-soft text-success-soft-foreground" };

const copy = {
  ar: {
    units: "إنشاء وحدات بالجملة", unitsHint: "وحدات متتالية في بلوك واحد ونموذج واحد. إن وُجد رقم منها في المشروع لا يُنشأ شيء.", block: "البلوك", model: "النموذج", from: "من الرقم", to: "إلى الرقم",
    count: (n: number) => `${formatNumber(n)} وحدة`, create: "إنشاء الوحدات", created: (n: number, from: number, to: number) => `أُنشئت ${formatNumber(n)} وحدة (${from}–${to}).`,
    weights: "أوزان الأنشطة", weightsHint: "أوزان أنشطة النموذج معًا؛ لا تُحفظ حتى يكون مجموعها 100% تمامًا.", activity: "النشاط", weight: "الوزن %", total: "المجموع", saveWeights: "حفظ الأوزان", savedWeights: "حُفظت الأوزان.", noModels: "لا نماذج بعد: يُنشأ النموذج وأنشطته من استيراد الأنشطة.",
    grid: "مصفوفة الحالة", gridHint: "انقر الخانة لنقلها إلى الحالة التالية.", show: "عرض", unit: "الوحدة", notInModel: "ليس في نموذج الوحدة", truncated: "تُعرض أول 200 وحدة؛ ضيّق النطاق.", noUnits: "لا وحدات في هذا النطاق.", readOnly: "للعرض فقط: لا تملك صلاحية تحديث الحالة.",
    statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<Status, string>, short: { NOT_STARTED: "—", IN_PROGRESS: "جارٍ", UNDER_REVIEW: "مراجعة", COMPLETE: "✓" } as Record<Status, string>, cellLabel: (unit: number, activity: string, now: string, then: string) => `الوحدة ${unit} · ${activity}: ${now}، انقر لتصبح ${then}`,
  },
  en: {
    units: "Create units in bulk", unitsHint: "Consecutive units in one block and one model. If any of the numbers exists in the project, nothing is created.", block: "Block", model: "Model", from: "From number", to: "To number",
    count: (n: number) => `${formatNumber(n)} units`, create: "Create the units", created: (n: number, from: number, to: number) => `${formatNumber(n)} units created (${from}–${to}).`,
    weights: "Activity weights", weightsHint: "A model's activity weights together; they cannot be saved until they total exactly 100%.", activity: "Activity", weight: "Weight %", total: "Total", saveWeights: "Save the weights", savedWeights: "The weights were saved.", noModels: "No models yet: a model and its activities come from the activities import.",
    grid: "Status matrix", gridHint: "Click a cell to move it to its next status.", show: "Show", unit: "Unit", notInModel: "Not in the unit's model", truncated: "The first 200 units are shown; narrow the range.", noUnits: "No units in this range.", readOnly: "View only: you cannot update the status.",
    statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<Status, string>, short: { NOT_STARTED: "—", IN_PROGRESS: "WIP", UNDER_REVIEW: "Rev", COMPLETE: "✓" } as Record<Status, string>, cellLabel: (unit: number, activity: string, now: string, then: string) => `Unit ${unit} · ${activity}: ${now}, click to make it ${then}`,
  },
  ur: {
    units: "یونٹس ایک ساتھ بنائیں", unitsHint: "ایک بلاک اور ایک ماڈل میں مسلسل یونٹس۔ اگر کوئی نمبر پروجیکٹ میں موجود ہو تو کچھ نہیں بنتا۔", block: "بلاک", model: "ماڈل", from: "نمبر سے", to: "نمبر تک",
    count: (n: number) => `${formatNumber(n)} یونٹس`, create: "یونٹس بنائیں", created: (n: number, from: number, to: number) => `${formatNumber(n)} یونٹس بن گئے (${from}–${to})۔`,
    weights: "سرگرمیوں کے وزن", weightsHint: "ماڈل کی سرگرمیوں کے وزن ایک ساتھ؛ مجموعہ ٹھیک 100% ہونے تک محفوظ نہیں ہوتے۔", activity: "سرگرمی", weight: "وزن %", total: "مجموعہ", saveWeights: "وزن محفوظ کریں", savedWeights: "وزن محفوظ ہو گئے۔", noModels: "ابھی کوئی ماڈل نہیں: ماڈل اور اس کی سرگرمیاں سرگرمیوں کی درآمد سے آتی ہیں۔",
    grid: "حیثیت کا میٹرکس", gridHint: "خانے پر کلک کریں تاکہ وہ اگلی حیثیت پر جائے۔", show: "دکھائیں", unit: "یونٹ", notInModel: "یونٹ کے ماڈل میں نہیں", truncated: "پہلے 200 یونٹس دکھائے گئے ہیں؛ حد کم کریں۔", noUnits: "اس حد میں کوئی یونٹ نہیں۔", readOnly: "صرف دیکھنے کے لیے: آپ حیثیت تازہ نہیں کر سکتے۔",
    statuses: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", UNDER_REVIEW: "جائزے میں", COMPLETE: "مکمل" } as Record<Status, string>, short: { NOT_STARTED: "—", IN_PROGRESS: "جاری", UNDER_REVIEW: "جائزہ", COMPLETE: "✓" } as Record<Status, string>, cellLabel: (unit: number, activity: string, now: string, then: string) => `یونٹ ${unit} · ${activity}: ${now}، کلک کریں تاکہ ${then} ہو`,
  },
};

const field = "min-h-11 w-28 rounded-[var(--radius)] border border-input bg-card px-2 text-sm text-foreground";

export function PmcEditors({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, copy);
  const structure = trpc.pmc.structure.useQuery({ tenantId, projectId });
  if (structure.error) return <SourceNotice query={structure} isArabic={language === "ar"} title={t.units} />;
  const data = structure.data;
  return (
    <div className="flex flex-col gap-5">
      <WriteGate permission="project.pmc.manage" projectId={projectId}>
        <BulkUnits tenantId={tenantId} projectId={projectId} blocks={data?.blocks ?? []} models={data?.models.map(model => model.modelCode) ?? []} start={(data?.highestUnitNumber ?? 0) + 1} onDone={() => void structure.refetch()} />
        <Weights tenantId={tenantId} projectId={projectId} models={data?.models ?? []} onDone={() => void structure.refetch()} />
      </WriteGate>
      <StatusGrid tenantId={tenantId} projectId={projectId} blocks={data?.blocks ?? []} />
    </div>
  );
}

function BulkUnits({ tenantId, projectId, blocks, models, start, onDone }: { tenantId: string; projectId: string; blocks: Array<{ id: string; code: string; zoneCode: string }>; models: string[]; start: number; onDone: () => void }) {
  const { language } = useLanguage(); const t = pickLanguage(language, copy);
  const [blockId, setBlockId] = React.useState<string>();
  const [modelCode, setModelCode] = React.useState<string>();
  const [from, setFrom] = React.useState(String(start));
  const [to, setTo] = React.useState(String(start + 9));
  React.useEffect(() => { setFrom(String(start)); setTo(String(start + 9)); }, [start]);
  const create = trpc.pmc.createUnits.useMutation({ onSuccess: onDone });
  const count = Number(to) - Number(from) + 1;
  return (
    <Card aria-label={t.units}>
      <CardHeader><CardTitle>{t.units}</CardTitle><p className="text-sm text-muted-foreground">{t.unitsHint}</p></CardHeader>
      <CardBody>
        <CheckedForm className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (blockId && modelCode) create.mutate({ tenantId, projectId, blockId, modelCode, from: Number(from), to: Number(to) }); }}>
          <div className="text-sm"><span className="mb-1 block">{t.block}</span><Select aria-label={t.block} className="min-w-40" value={blockId} onValueChange={setBlockId} options={blocks.map(block => ({ value: block.id, label: `${block.zoneCode} / ${block.code}` }))} /></div>
          <div className="text-sm"><span className="mb-1 block">{t.model}</span><Select aria-label={t.model} className="min-w-32" value={modelCode} onValueChange={setModelCode} options={models.map(model => ({ value: model, label: model }))} /></div>
          <label className="text-sm"><span className="mb-1 block">{t.from}</span><input className={field} dir="ltr" type="number" min="1" step="1" required value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block">{t.to}</span><input className={field} dir="ltr" type="number" min="1" step="1" required value={to} onChange={event => setTo(event.target.value)} /></label>
          <Button type="submit" loading={create.isPending} disabled={!blockId || !modelCode || !(count >= 1)}>{t.create}{count >= 1 ? ` · ${t.count(count)}` : ""}</Button>
        </CheckedForm>
        {create.error ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{getLocalizedProjectError(create.error, language)}</p> : null}
        {create.data ? <p role="status" className="mt-3 text-sm text-success">{t.created(create.data.created, create.data.from, create.data.to)}</p> : null}
      </CardBody>
    </Card>
  );
}

function Weights({ tenantId, projectId, models, onDone }: { tenantId: string; projectId: string; models: Array<{ modelCode: string; totalWeight: number; activities: Array<{ id: string; code: string; name: string; weightPercent: number }> }>; onDone: () => void }) {
  const { language } = useLanguage(); const t = pickLanguage(language, copy);
  const [modelCode, setModelCode] = React.useState<string | undefined>(models[0]?.modelCode);
  React.useEffect(() => { if (!modelCode && models[0]) setModelCode(models[0].modelCode); }, [models, modelCode]);
  const model = models.find(item => item.modelCode === modelCode);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setDraft(Object.fromEntries((model?.activities ?? []).map(activity => [activity.id, String(activity.weightPercent)]))); }, [model]);
  const save = trpc.pmc.saveActivityWeights.useMutation({ onSuccess: onDone });
  const total = Math.round((model?.activities ?? []).reduce((sum, activity) => sum + (Number(draft[activity.id]) || 0), 0) * 10000) / 10000;
  const complete = Math.abs(total - 100) <= 0.0001;
  if (!models.length) return <Card aria-label={t.weights}><CardBody><p className="text-sm text-muted-foreground">{t.noModels}</p></CardBody></Card>;
  return (
    <Card aria-label={t.weights}>
      <CardHeader><CardTitle>{t.weights}</CardTitle><p className="text-sm text-muted-foreground">{t.weightsHint}</p></CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-sm"><span className="mb-1 block">{t.model}</span><Select aria-label={t.model} className="min-w-32" value={modelCode} onValueChange={setModelCode} options={models.map(item => ({ value: item.modelCode, label: item.modelCode }))} /></div>
          <p data-weight-total className="flex items-center gap-2 text-sm"><span>{t.total}:</span><Badge tone={complete ? "success" : "warning"}><bdi dir="ltr">{formatPercent(total, 2)} / 100%</bdi></Badge></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm" aria-label={t.weights}>
            <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-2 text-start">{t.activity}</th><th scope="col" className="py-2 text-start">{t.weight}</th></tr></thead>
            <tbody className="divide-y divide-border">{(model?.activities ?? []).map(activity => (
              <tr key={activity.id}><th scope="row" className="py-2 text-start font-normal"><bdi>{activity.code}</bdi> · {activity.name}</th>
                <td className="py-1"><input aria-label={`${t.weight}: ${activity.code}`} className={field} dir="ltr" inputMode="decimal" value={draft[activity.id] ?? ""} onChange={event => setDraft(current => ({ ...current, [activity.id]: event.target.value }))} /></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={save.isPending} disabled={!complete || !model} onClick={() => model && save.mutate({ tenantId, projectId, modelCode: model.modelCode, weights: model.activities.map(activity => ({ activityDefinitionId: activity.id, weightPercent: Number(draft[activity.id]) || 0 })) })}>{t.saveWeights}</Button>
          {save.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(save.error, language)}</p> : null}
          {save.isSuccess ? <p role="status" className="text-sm text-success">{t.savedWeights}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}

function StatusGrid({ tenantId, projectId, blocks }: { tenantId: string; projectId: string; blocks: Array<{ id: string; code: string; zoneCode: string }> }) {
  const { language } = useLanguage(); const t = pickLanguage(language, copy);
  const canUpdate = useCan("project.pmc.update", projectId);
  const [blockId, setBlockId] = React.useState<string>();
  const [from, setFrom] = React.useState("1");
  const [to, setTo] = React.useState("20");
  const [asked, setAsked] = React.useState<{ blockId?: string; from?: number; to?: number } | null>(null);
  const grid = trpc.pmc.statusGrid.useQuery({ tenantId, projectId, ...(asked ?? {}) }, { enabled: asked !== null });
  const change = trpc.pmc.setUnitActivityStatus.useMutation({ onSuccess: () => void grid.refetch() });
  const statusOf = new Map((grid.data?.cells ?? []).map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, cell.status as Status]));
  // one column per activity code across the units shown; a unit of another model has no cell in it
  const codes = Array.from(new Set((grid.data?.activities ?? []).map(activity => activity.code)));
  const definitionOf = new Map((grid.data?.activities ?? []).map(activity => [`${activity.modelCode}:${activity.code}`, activity]));
  return (
    <Card aria-label={t.grid}>
      <CardHeader><CardTitle>{t.grid}</CardTitle><p className="text-sm text-muted-foreground">{canUpdate ? t.gridHint : t.readOnly}</p></CardHeader>
      <CardBody className="flex flex-col gap-4">
        <CheckedForm className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setAsked({ ...(blockId ? { blockId } : {}), from: Number(from), to: Number(to) }); }}>
          <div className="text-sm"><span className="mb-1 block">{t.block}</span><Select aria-label={t.block} className="min-w-40" value={blockId} placeholder="—" onValueChange={setBlockId} options={blocks.map(block => ({ value: block.id, label: `${block.zoneCode} / ${block.code}` }))} /></div>
          <label className="text-sm"><span className="mb-1 block">{t.from}</span><input className={field} dir="ltr" type="number" min="1" step="1" required value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block">{t.to}</span><input className={field} dir="ltr" type="number" min="1" step="1" required value={to} onChange={event => setTo(event.target.value)} /></label>
          <Button type="submit" variant="secondary">{t.show}</Button>
        </CheckedForm>
        <div className="flex flex-wrap gap-2" aria-hidden="true">{STATUSES.map(status => <span key={status} className={`rounded-full px-2.5 py-0.5 text-xs ${TONE[status]}`}>{t.statuses[status]}</span>)}</div>
        {grid.error ? <SourceNotice query={grid} isArabic={language === "ar"} title={t.grid} /> : null}
        {change.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(change.error, language)}</p> : null}
        {grid.data && !grid.data.units.length ? <p className="text-sm text-muted-foreground">{t.noUnits}</p> : null}
        {grid.data?.units.length ? (
          <div className="overflow-x-auto">
            <table className="text-xs" aria-label={t.grid}>
              <thead><tr><th scope="col" className="sticky start-0 bg-card px-2 py-2 text-start">{t.unit}</th>{codes.map(code => <th key={code} scope="col" className="px-1 py-2 text-center font-medium"><bdi>{code}</bdi></th>)}</tr></thead>
              <tbody>{grid.data.units.map(unit => (
                <tr key={unit.id} className="border-t border-border">
                  <th scope="row" className="sticky start-0 bg-card px-2 py-1 text-start font-medium tabular-nums">{unit.unitNumber} <span className="text-muted-foreground">({unit.modelCode})</span></th>
                  {codes.map(code => {
                    const definition = definitionOf.get(`${unit.modelCode}:${code}`);
                    if (!definition) return <td key={code} className="px-1 py-1 text-center text-muted-foreground" title={t.notInModel}>—</td>;
                    const status = statusOf.get(`${unit.id}:${definition.id}`) ?? "NOT_STARTED";
                    return (
                      <td key={code} className="px-1 py-1">
                        <button type="button" data-cell-status={status} disabled={!canUpdate || change.isPending} aria-label={t.cellLabel(unit.unitNumber, definition.name, t.statuses[status], t.statuses[next(status)])}
                          onClick={() => change.mutate({ tenantId, projectId, unitId: unit.id, activityDefinitionId: definition.id, status: next(status) })}
                          className={`min-h-9 min-w-9 rounded-[calc(var(--radius)-2px)] px-1.5 text-[11px] font-medium ${TONE[status]} disabled:cursor-default`}>{t.short[status]}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        {grid.data?.truncated ? <p className="text-xs text-muted-foreground">{t.truncated}</p> : null}
      </CardBody>
    </Card>
  );
}
