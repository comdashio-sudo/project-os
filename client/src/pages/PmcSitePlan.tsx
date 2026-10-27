import { FileDropzone, Select } from "@/components/ds";
import { ALL, LabelledSelect } from "@/components/LabelledSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from "@/lib/uploadLimit";
import { formatMoney } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { useDirectUpload } from "@/lib/useDirectUpload";
import React, { useState } from "react";
import { WriteGate, useCan } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    activity: "النشاط", overall: "التقدم الكلي للوحدة", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", noPlan: "لم يُرفع مخطط الموقع بعد. ارفع صورة المخطط (PNG أو JPEG) ثم ملف GeoJSON لحدود الوحدات.",
    uploadPlan: "رفع صورة المخطط", uploadGeo: "رفع ملف GeoJSON للوحدات", saved: (n: number) => `حُفظت مضلعات ${n} وحدة`, uploaded: "رُفع المخطط",
    withoutPolygon: (n: number) => `${n} وحدة بلا مضلع على المخطط`, legend: "دليل الألوان", notInModel: "النشاط غير موجود في نموذج الوحدة",
    statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<string, string>,
    unit: "الوحدة", model: "النموذج", zone: "المنطقة", block: "البلوك", progress: "التقدم", close: "إغلاق", engineer: "المهندس", verification: "حالة التحقق", weight: "الوزن", errors: "مشاكل في الملف", planAlt: "مخطط الموقع", noNumber: "بلا رقم", changeStatus: "تغيير الحالة", earned: "القيمة المكتسبة", linkedMoved: (n: number) => `${n} بند WBS تحرّك`, evNone: "لا بند WBS مرتبط تغيّر تقدمه",
  },
  en: {
    activity: "Activity", overall: "Overall unit progress", loading: "Loading…", retry: "Retry", noPlan: "No site plan has been uploaded yet. Upload the plan image (PNG or JPEG), then a GeoJSON file with the unit outlines.",
    uploadPlan: "Upload plan image", uploadGeo: "Upload unit GeoJSON", saved: (n: number) => `Saved outlines for ${n} units`, uploaded: "Plan uploaded",
    withoutPolygon: (n: number) => `${n} units have no outline on the plan`, legend: "Colour key", notInModel: "The activity is not in this unit's model",
    statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", model: "Model", zone: "Zone", block: "Block", progress: "Progress", close: "Close", engineer: "Engineer", verification: "Verification", weight: "Weight", errors: "Problems in the file", planAlt: "Site plan", noNumber: "no number", changeStatus: "Change status", earned: "Earned value", linkedMoved: (n: number) => `${n} WBS item(s) moved`, evNone: "No linked WBS item changed its progress",
  }, ur: {
    activity: "Activity", overall: "Overall unit progress", loading: "Loading…", retry: "Retry", noPlan: "No site plan has been uploaded yet. Upload the plan image (PNG or JPEG), then a GeoJSON file with the unit outlines.",
    uploadPlan: "Upload plan image", uploadGeo: "Upload unit GeoJSON", saved: (n: number) => `Saved outlines for ${n} units`, uploaded: "Plan uploaded",
    withoutPolygon: (n: number) => `${n} units have no outline on the plan`, legend: "Colour key", notInModel: "The activity is not in this unit's model",
    statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", model: "Model", zone: "Zone", block: "Block", progress: "Progress", close: "Close", engineer: "Engineer", verification: "Verification", weight: "Weight", errors: "Problems in the file", planAlt: "Site plan", noNumber: "no number", changeStatus: "Change status", earned: "Earned value", linkedMoved: (n: number) => `${n} WBS item(s) moved`, evNone: "No linked WBS item changed its progress",
  },
};
// status colours come from the design tokens, so the plan follows the direction and its dark mode
const COLORS: Record<string, string> = { NOT_STARTED: "var(--muted)", IN_PROGRESS: "var(--warning)", UNDER_REVIEW: "var(--info)", COMPLETE: "var(--success)" };
type Ring = Array<[number, number]>;
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
const polygonsOf = (geometry: Geometry): Ring[][] => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);
// SVG coordinates (not a figure for a person): one decimal is enough for the drawing
const coordinate = (value: number) => String(Math.round(value * 10) / 10);
const pointsOf = (ring: Ring, w: number, h: number) => ring.map(([x, y]) => `${coordinate(x * w)},${coordinate(y * h)}`).join(" ");
const fillFor = (status: string | null, progress: number | null) => (status ? COLORS[status] : progress === null ? "var(--muted)" : `color-mix(in srgb, var(--primary) ${Math.round((0.12 + (progress / 100) * 0.7) * 100)}%, transparent)`);

export function PmcSitePlan({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const [activityCode, setActivityCode] = useState<string>("");
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const map = trpc.pmc.siteMap.useQuery({ tenantId, projectId, activityCode: activityCode || undefined });
  const card = trpc.pmc.unitCard.useQuery({ tenantId, projectId, unitNumber: selected ?? 0 }, { enabled: selected !== null });
  const [evm, setEvm] = useState<null | { evBefore: number; evAfter: number; moved: number }>(null);
  const canUpdateStatus = useCan("project.pmc.update", projectId);
  const change = trpc.pmc.setUnitActivityStatus.useMutation({ onSuccess: result => { setEvm(result.evm ? { evBefore: result.evm.evBefore, evAfter: result.evm.evAfter, moved: result.evm.changed.length } : null); map.refetch(); card.refetch(); } });
  const direct = useDirectUpload({ tenantId, projectId, purpose: "sitePlan" }); // the image goes browser → Storage on a signed URL (G-139)
  const upload = trpc.pmc.uploadSitePlan.useMutation({ onSuccess: () => { setMessage(t.uploaded); map.refetch(); } });
  const geometries = trpc.pmc.saveUnitGeometries.useMutation({ onSuccess: result => { if (result.saved > 0) { setMessage(t.saved(result.saved)); map.refetch(); } } });
  const error = upload.error ?? geometries.error ?? change.error;

  if (map.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>;
  if (!map.data) return <div><p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(map.error, isArabic)}</p><button type="button" className="mt-2 min-h-[44px] rounded-lg border px-4" onClick={() => map.refetch()}>{t.retry}</button></div>;
  const { plan, units, activities, withoutPolygon } = map.data;

  return (
    <div className="space-y-4" data-testid="site-plan">
      <div className="flex flex-wrap items-end gap-3">
        <LabelledSelect label={t.activity} className="text-sm" value={activityCode || ALL} onValueChange={value => { setActivityCode(value === ALL ? "" : value); setSelected(null); }} options={[{ value: ALL, label: t.overall }, ...activities.map(a => ({ value: a.code, label: `${a.code} · ${a.name}` }))]} />
        <WriteGate permission={"project.pmc.manage"} projectId={projectId}><div role="group" aria-label={t.uploadPlan} className="min-w-64 flex-1 text-sm"><p className="mb-1">{t.uploadPlan}</p><FileDropzone accept={[".png", ".jpg", ".jpeg"]} maxBytes={MAX_IMPORT_UPLOAD_BYTES} items={[]} onFiles={async ([file]) => { try { upload.mutate({ tenantId, projectId, fileName: file.name, uploadKey: await direct.upload(file, file.type) }); } catch (caught) { setMessage(getLocalizedProjectError(caught, isArabic)); } }} /></div></WriteGate>
        <WriteGate permission={"project.pmc.manage"} projectId={projectId}><div role="group" aria-label={t.uploadGeo} className="min-w-64 flex-1 text-sm"><p className="mb-1">{t.uploadGeo}</p><FileDropzone accept={[".geojson", ".json"]} maxBytes={MAX_UPLOAD_BYTES} items={[]} onFiles={async ([file]) => { geometries.mutate({ tenantId, projectId, geojson: await file.text() }); }} /></div></WriteGate>
      </div>
      {error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, isArabic)}</p>}
      {geometries.data && geometries.data.errors.length > 0 && <div role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-soft-foreground"><b>{t.errors}:</b><ul className="mt-1 list-disc ps-5">{geometries.data.errors.slice(0, 20).map((e, i) => <li key={i}>#{e.index + 1} · {e.unitNumber ?? t.noNumber} · {e.code}</li>)}</ul></div>}
      {message && <p role="status" className="text-sm text-success-soft-foreground">{message}</p>}
      {withoutPolygon > 0 && <p className="text-sm text-warning-soft-foreground">{t.withoutPolygon(withoutPolygon)}</p>}
      {!plan ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t.noPlan}</p> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <svg role="img" aria-label={t.planAlt} viewBox={`0 0 ${plan.widthPx} ${plan.heightPx}`} className="w-full rounded-xl border bg-muted" style={{ direction: "ltr" }}>
            <image href={plan.url} width={plan.widthPx} height={plan.heightPx} />
            {units.map(unit => unit.geometry && polygonsOf(unit.geometry as Geometry).map((rings, index) => (
              <polygon
                key={`${unit.unitNumber}-${index}`}
                data-unit={unit.unitNumber}
                role="button"
                tabIndex={0}
                aria-label={`${t.unit} ${unit.unitNumber}: ${unit.status ? t.statuses[unit.status] : unit.progressPercent === null ? (activityCode ? t.notInModel : "—") : `${unit.progressPercent}%`}`}
                points={pointsOf(rings[0], plan.widthPx, plan.heightPx)}
                fill={fillFor(unit.status, unit.progressPercent)}
                fillOpacity={0.75}
                stroke={selected === unit.unitNumber ? "var(--primary)" : "var(--muted-foreground)"}
                strokeWidth={selected === unit.unitNumber ? plan.widthPx / 150 : plan.widthPx / 600}
                strokeDasharray={activityCode && !unit.status ? "6 4" : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => { setSelected(unit.unitNumber); setEvm(null); }}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(unit.unitNumber); setEvm(null); } }}
              />
            )))}
          </svg>
          <div className="space-y-4">
            <div><h3 className="mb-1 text-sm font-semibold">{t.legend}</h3><ul className="space-y-1 text-sm">{Object.entries(COLORS).map(([status, color]) => <li key={status} className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: color }} />{t.statuses[status]}</li>)}</ul></div>
            {selected !== null && (
              <section aria-label={`${t.unit} ${selected}`} className="rounded-xl border p-3 text-sm" data-testid="unit-card">
                <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{t.unit} {selected}</h3><button type="button" className="min-h-[44px] min-w-[44px] rounded-lg border px-2" onClick={() => { setSelected(null); setEvm(null); }}>{t.close}</button></div>
                {card.isLoading && <p role="status">{t.loading}</p>}
                {card.error && <p role="alert" className="text-danger-soft-foreground">{getLocalizedProjectError(card.error, isArabic)}</p>}
                {card.data && (<>
                  <p className="text-muted-foreground">{t.model}: {card.data.modelCode} · {t.zone}: {card.data.zoneCode} · {t.block}: {card.data.blockCode}</p>
                  <p className="mt-1">{t.progress}: <b>{card.data.progressPercent === null ? "—" : `${card.data.progressPercent}%`}</b></p>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">{card.data.activities.map(a => <li key={a.code} className="flex flex-wrap justify-between gap-2 border-t pt-1"><span>{a.code} · {a.name}</span><span className="whitespace-nowrap"><span className="me-1 inline-block h-3 w-3 rounded" style={{ backgroundColor: COLORS[a.status] }} />{a.verificationStatus ? `${a.verificationStatus} · ` : ""}<Select aria-label={`${t.changeStatus}: ${a.code}`} className="min-w-36" value={a.status} disabled={change.isPending || !canUpdateStatus} onValueChange={value => change.mutate({ tenantId, projectId, unitId: card.data!.unitId, activityDefinitionId: a.definitionId, status: value as "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE" })} options={Object.keys(COLORS).map(status => ({ value: status, label: t.statuses[status] }))} /></span></li>)}</ul>
                  {evm && <p role="status" className="mt-2 rounded-lg bg-success-soft p-2 text-success-soft-foreground" data-testid="evm-effect">{evm.moved ? <>{t.earned}: <bdi dir="ltr">{formatMoney(evm.evBefore, map.data.currency, isArabic)} → {formatMoney(evm.evAfter, map.data.currency, isArabic)}</bdi> · {t.linkedMoved(evm.moved)}</> : t.evNone}</p>}
                </>)}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
