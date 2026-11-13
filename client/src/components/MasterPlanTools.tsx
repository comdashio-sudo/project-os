// Master Plan tools (work order 5, item 9): rotation and real size of the plan (G-135), a canvas surface for large plans (G-135), moving an
// entity in the parent tree and editing its geometry (G-136), and the entity's alerts with jumps to the sections that hold its WBS item and
// activity (G-137). The rules and arithmetic are shared/masterPlanTools.ts; every write is shown only to someone who may make it, and the
// server judges every call anyway.
import { Select } from "@/components/ds";
/** The ds list has no empty value: «no parent» is this sentinel on screen and "" in the state. */
const NO_PARENT = "__none";
import { CheckedForm } from "@/components/CheckedForm";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { WriteGate } from "@/lib/permissions";
import { buildHitIndex, calibratedDimensions, entityAlerts, hitTest, normalizeRotation, wouldCreateCycle, type AlertActivity, type PlanGeometry } from "@shared/masterPlanTools";
import { RotateCcw, RotateCw } from "lucide-react";
import { pickLanguage } from "@/lib/language";

export type ToolsEntity = { id: string; code: string; name: string; parentEntityId: string | null; geometry: string; status: string; progressPercent: string | number; plannedValue: string | number; actualValue: string | number; wbsItemId: string | null; activityId: string | null };
export const parsePlanGeometry = (raw: string): PlanGeometry | null => { try { const value = JSON.parse(raw) as PlanGeometry; return [value.x, value.y, value.width, value.height].every(Number.isFinite) ? value : null; } catch { return null; } };

// ---------------------------------------------------------------- rotation and the real size of the plan
export function MasterPlanVersionTools({ tenantId, projectId, version, onSaved }: { tenantId: string; projectId: string; version: { id: string; rotationDegrees: number; mapWidthMeters: string | number | null; mapHeightMeters: string | number | null } | undefined; onSaved: () => void }) {
  const { isArabic, language } = useLanguage();
  const save = trpc.masterPlans.setVersionGeometry.useMutation({ onSuccess: onSaved });
  const [rotation, setRotation] = useState(String(version?.rotationDegrees ?? 0));
  const [width, setWidth] = useState(version?.mapWidthMeters ? String(Number(version.mapWidthMeters)) : "");
  const [height, setHeight] = useState(version?.mapHeightMeters ? String(Number(version.mapHeightMeters)) : "");
  useEffect(() => { setRotation(String(version?.rotationDegrees ?? 0)); setWidth(version?.mapWidthMeters ? String(Number(version.mapWidthMeters)) : ""); setHeight(version?.mapHeightMeters ? String(Number(version.mapHeightMeters)) : ""); }, [version?.id, version?.rotationDegrees, version?.mapWidthMeters, version?.mapHeightMeters]);
  if (!version) return null;
  const t = pickLanguage(language, { ar: { title: "تدوير الخطة ومعايرتها", note: "يدوّر الخلفية فقط، لا الكيانات. أدخل العرض والطول الحقيقيين لمنطقة الخطة بالأمتار لتظهر أبعاد كل كيان بالمتر.", rotation: "زاوية التدوير (درجة)", left: "تدوير 90° لليسار", right: "تدوير 90° لليمين", width: "عرض منطقة الخطة (م)", height: "طول منطقة الخطة (م)", save: "حفظ التدوير والمعايرة" }, en: { title: "Rotate and calibrate the plan", note: "Turns the background only, not the entities. Enter the real width and length of the plan area in metres so each entity's size shows in metres.", rotation: "Rotation (degrees)", left: "Rotate 90° left", right: "Rotate 90° right", width: "Plan area width (m)", height: "Plan area length (m)", save: "Save rotation and calibration" }, ur: { title: "پلان کو گھمائیں اور درست کریں", note: "صرف پس منظر گھماتا ہے، اکائیاں نہیں۔ پلان کے رقبے کی اصل چوڑائی اور لمبائی میٹر میں لکھیں تاکہ ہر اکائی کا سائز میٹر میں دکھائی دے۔", rotation: "گردش (ڈگری)", left: "90° بائیں گھمائیں", right: "90° دائیں گھمائیں", width: "پلان کے رقبے کی چوڑائی (میٹر)", height: "پلان کے رقبے کی لمبائی (میٹر)", save: "گردش اور درستگی محفوظ کریں" } });
  const turn = (by: number) => setRotation(String(normalizeRotation(Number(rotation || 0) + by)));
  return <WriteGate permission="project.write" projectId={projectId}><CheckedForm className="mt-3 rounded-xl border border-dashed border-[#74d0c1] bg-[#f4fbfa] p-3" onSubmit={event => { event.preventDefault(); save.mutate({ tenantId, projectId, masterPlanVersionId: version.id, rotationDegrees: Number(rotation || 0), mapWidthMeters: width ? Number(width) : null, mapHeightMeters: height ? Number(height) : null }); }}>
    <h3 className="text-sm font-semibold">{t.title}</h3><p className="mt-1 text-xs text-slate-500">{t.note}</p>
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <Label className="min-w-28 flex-1 text-xs">{t.rotation}<Input className="mt-1" aria-label={t.rotation} type="number" step="1" required value={rotation} onChange={event => setRotation(event.target.value)} /></Label>
      <Button type="button" variant="outline" size="sm" aria-label={t.left} onClick={() => turn(-90)}><RotateCcw className="h-4 w-4" /></Button>
      <Button type="button" variant="outline" size="sm" aria-label={t.right} onClick={() => turn(90)}><RotateCw className="h-4 w-4" /></Button>
      <Label className="min-w-28 flex-1 text-xs">{t.width}<Input className="mt-1" aria-label={t.width} type="number" min="0" step="0.01" value={width} onChange={event => setWidth(event.target.value)} /></Label>
      <Label className="min-w-28 flex-1 text-xs">{t.height}<Input className="mt-1" aria-label={t.height} type="number" min="0" step="0.01" value={height} onChange={event => setHeight(event.target.value)} /></Label>
    </div>
    {save.error ? <p role="alert" className="mt-2 text-xs text-red-700">{getLocalizedProjectError(save.error, language)}</p> : null}
    <Button className="mt-3" disabled={save.isPending}>{t.save}</Button>
  </CheckedForm></WriteGate>;
}

// ---------------------------------------------------------------- the canvas surface for large plans
export function MasterPlanCanvas({ entities, selectedId, colorOf, onSelect, label }: { entities: ToolsEntity[]; selectedId: string | null; colorOf: (entity: ToolsEntity) => string; onSelect: (id: string) => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawn = useMemo(() => entities.flatMap(entity => { const geometry = parsePlanGeometry(entity.geometry); return geometry ? [{ id: entity.id, geometry, entity }] : []; }), [entities]);
  const index = useMemo(() => buildHitIndex(drawn), [drawn]);
  useEffect(() => {
    const element = canvas.current; const context = element?.getContext?.("2d");
    if (!element || !context) return;
    const w = element.width; const h = element.height;
    context.clearRect(0, 0, w, h);
    for (const { geometry, entity, id } of drawn) {
      const color = colorOf(entity);
      context.fillStyle = `${color}33`; context.strokeStyle = color; context.lineWidth = id === selectedId ? 3 : 1;
      const x = (geometry.x / 100) * w, y = (geometry.y / 100) * h, bw = (geometry.width / 100) * w, bh = (geometry.height / 100) * h;
      context.fillRect(x, y, bw, bh); context.strokeRect(x, y, bw, bh);
    }
  }, [drawn, selectedId, colorOf]);
  return <canvas ref={canvas} width={1600} height={1000} role="img" aria-label={label} data-testid="master-plan-canvas" className="absolute inset-0 h-full w-full cursor-pointer"
    onClick={event => { const box = event.currentTarget.getBoundingClientRect(); if (!box.width || !box.height) return; const id = hitTest(index, ((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100); if (id) onSelect(id); }} />;
}

// ---------------------------------------------------------------- one entity: alerts, jumps, parent, geometry
const SECTION_LINKS = [
  { id: "manager-schedule", ar: "فتح قسم الخطة والتكلفة (WBS والأنشطة)", en: "Open the schedule & cost section (WBS and activities)", ur: "منصوبہ اور لاگت کا حصہ کھولیں (WBS اور سرگرمیاں)" },
  { id: "manager-commercial", ar: "فتح قسم العقود والمستندات", en: "Open the contracts & documents section", ur: "معاہدوں اور دستاویزات کا حصہ کھولیں" },
];
export function MasterPlanEntityTools({ tenantId, projectId, entity, entities, activity, mapWidthMeters, mapHeightMeters, onChanged }: { tenantId: string; projectId: string; entity: ToolsEntity; entities: ToolsEntity[]; activity: AlertActivity; mapWidthMeters: string | number | null | undefined; mapHeightMeters: string | number | null | undefined; onChanged: () => void }) {
  const { isArabic, language } = useLanguage();
  const update = trpc.masterPlans.updateEntityLayout.useMutation({ onSuccess: onChanged });
  const geometry = parsePlanGeometry(entity.geometry);
  const [draft, setDraft] = useState({ x: String(geometry?.x ?? 0), y: String(geometry?.y ?? 0), width: String(geometry?.width ?? 10), height: String(geometry?.height ?? 10) });
  useEffect(() => { const g = parsePlanGeometry(entity.geometry); setDraft({ x: String(g?.x ?? 0), y: String(g?.y ?? 0), width: String(g?.width ?? 10), height: String(g?.height ?? 10) }); }, [entity.id, entity.geometry]);
  const t = pickLanguage(language, { ar: { alerts: "تنبيهات الكيان", none: "لا تنبيهات", blocked: "الكيان متعثر", overdue: "النشاط المرتبط تجاوز تاريخ نهايته المخطط بـ", days: "يوم", cost: "التكلفة الفعلية تتجاوز المخطط بـ", unlinked: "الكيان غير مرتبط ببند WBS ولا نشاط", size: "الأبعاد الحقيقية", meters: "م", area: "م²", parentTitle: "الأب في الشجرة", noParent: "بلا أب (جذر)", saveParent: "حفظ الأب", geometryTitle: "موضع الكيان وحجمه", x: "س", y: "ص", w: "العرض", h: "الارتفاع", saveGeometry: "حفظ الموضع والحجم", jumps: "الانتقال إلى" }, en: { alerts: "Entity alerts", none: "No alerts", blocked: "The entity is blocked", overdue: "The linked activity is past its planned finish by", days: "days", cost: "Actual cost exceeds plan by", unlinked: "The entity is not linked to a WBS item or an activity", size: "Real size", meters: "m", area: "m²", parentTitle: "Parent in the tree", noParent: "No parent (root)", saveParent: "Save parent", geometryTitle: "Entity position and size", x: "X", y: "Y", w: "Width", h: "Height", saveGeometry: "Save position and size", jumps: "Jump to" }, ur: { alerts: "اکائی کے الرٹ", none: "کوئی الرٹ نہیں", blocked: "اکائی رکی ہوئی ہے", overdue: "جڑی ہوئی سرگرمی اپنی منصوبہ بند اختتامی تاریخ سے آگے نکل گئی ہے", days: "دن", cost: "اصل لاگت منصوبے سے زیادہ ہے، فرق", unlinked: "اکائی کسی WBS آئٹم یا سرگرمی سے نہیں جڑی", size: "اصل سائز", meters: "m", area: "m²", parentTitle: "درخت میں اوپر کی اکائی", noParent: "کوئی اوپر کی اکائی نہیں (جڑ)", saveParent: "اوپر کی اکائی محفوظ کریں", geometryTitle: "اکائی کی جگہ اور سائز", x: "X", y: "Y", w: "چوڑائی", h: "اونچائی", saveGeometry: "جگہ اور سائز محفوظ کریں", jumps: "اس پر جائیں" } });
  const alerts = entityAlerts({ status: entity.status, progressPercent: Number(entity.progressPercent), plannedValue: Number(entity.plannedValue), actualValue: Number(entity.actualValue), wbsItemId: entity.wbsItemId, activityId: entity.activityId }, activity);
  const alertText = (alert: ReturnType<typeof entityAlerts>[number]) => alert.code === "blocked" ? t.blocked : alert.code === "overdue" ? `${t.overdue} ${alert.days} ${t.days}` : alert.code === "cost_over" ? `${t.cost} ${alert.percent}%` : t.unlinked;
  const real = geometry ? calibratedDimensions(geometry, Number(mapWidthMeters) || null, Number(mapHeightMeters) || null) : null;
  const parentOf = useMemo(() => new Map(entities.map(item => [item.id, item.parentEntityId])), [entities]);
  const candidates = entities.filter(item => item.id !== entity.id && !wouldCreateCycle(parentOf, entity.id, item.id));
  const [parent, setParent] = useState(entity.parentEntityId ?? "");
  useEffect(() => setParent(entity.parentEntityId ?? ""), [entity.id, entity.parentEntityId]);
  const tone = (severity: string) => severity === "critical" ? "bg-red-50 text-red-800" : severity === "warning" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700";
  return <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
    <section aria-label={t.alerts}><h4 className="font-semibold">{t.alerts}</h4>
      {alerts.length ? <ul className="mt-1 space-y-1">{alerts.map(alert => <li key={alert.code} className={`rounded-lg px-2 py-1 ${tone(alert.severity)}`}>{alertText(alert)}</li>)}</ul> : <p className="mt-1 text-slate-500">{t.none}</p>}
      {real ? <p className="mt-2 text-slate-700">{t.size}: {real.widthMeters} × {real.heightMeters} {t.meters} · {real.areaSquareMeters} {t.area}</p> : null}
      <p className="mt-2 flex flex-wrap items-center gap-2"><span className="text-slate-500">{t.jumps}:</span>{SECTION_LINKS.map(link => <a key={link.id} href={`#${link.id}`} className="font-semibold text-[#0e6b70] underline">{pickLanguage(language, link)}</a>)}</p>
    </section>
    <WriteGate permission="project.write" projectId={projectId}>
      <CheckedForm className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); update.mutate({ tenantId, projectId, entityId: entity.id, parentEntityId: parent || null }); }}>
        <Label className="min-w-48 flex-1">{t.parentTitle}<Select aria-label={t.parentTitle} className="mt-1" value={parent || NO_PARENT} onValueChange={value => setParent(value === NO_PARENT ? "" : value)} options={[{ value: NO_PARENT, label: t.noParent }, ...candidates.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} /></Label>
        <Button size="sm" disabled={update.isPending || parent === (entity.parentEntityId ?? "")}>{t.saveParent}</Button>
      </CheckedForm>
      <CheckedForm className="grid grid-cols-2 gap-2 md:grid-cols-5" onSubmit={event => { event.preventDefault(); update.mutate({ tenantId, projectId, entityId: entity.id, geometry: { x: Number(draft.x), y: Number(draft.y), width: Number(draft.width), height: Number(draft.height) } }); }}>
        <p className="col-span-full font-semibold">{t.geometryTitle}</p>
        {([["x", t.x], ["y", t.y], ["width", t.w], ["height", t.h]] as const).map(([key, label]) => <Label key={key}>{label}<Input className="mt-1" aria-label={label} type="number" step="0.1" required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></Label>)}
        <Button size="sm" className="self-end" disabled={update.isPending}>{t.saveGeometry}</Button>
      </CheckedForm>
      {update.error ? <p role="alert" className="text-red-700">{getLocalizedProjectError(update.error, language)}</p> : null}
    </WriteGate>
  </div>;
}

// ---------------------------------------------------------------- sharing a saved view
export function SnapshotShareToggle({ tenantId, projectId, snapshot, currentUserId, onChanged }: { tenantId: string; projectId: string; snapshot: { id: string; createdByUserId: number; sharedWithProject: boolean }; currentUserId: number | undefined; onChanged: () => void }) {
  const { language } = useLanguage();
  const share = trpc.masterPlans.setSnapshotSharing.useMutation({ onSuccess: onChanged });
  if (snapshot.createdByUserId !== currentUserId) return snapshot.sharedWithProject ? <span className="text-[10px] font-medium text-slate-500">{pickLanguage(language, { ar: "مشاركة من زميل", en: "Shared by a colleague", ur: "ایک ساتھی کی طرف سے شیئر کیا گیا" })}</span> : null;
  return <Button type="button" size="sm" variant={snapshot.sharedWithProject ? "default" : "outline"} aria-pressed={snapshot.sharedWithProject} disabled={share.isPending} onClick={() => share.mutate({ tenantId, projectId, snapshotId: snapshot.id, shared: !snapshot.sharedWithProject })}>{snapshot.sharedWithProject ? pickLanguage(language, { ar: "إيقاف المشاركة", en: "Stop sharing", ur: "شیئرنگ بند کریں" }) : pickLanguage(language, { ar: "مشاركة مع المشروع", en: "Share with the project", ur: "پروجیکٹ کے ساتھ شیئر کریں" })}</Button>;
}
