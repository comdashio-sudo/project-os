// Q-61 (3): on the live schedule screen, which stages of the P6 schedule each weight group follows — once per project. Everything shown comes from
// schedule.stageMapping (server/scheduleStageMapping.ts): the schedule's stages with their P6 names, the weight groups with their weight, the saved links, the
// platform's suggestion by name (never by code: the two files' Q codes mean different things), whether the planned curve can be computed, and Q-61 (2)'s
// differences between the schedule and the villas. A person with project.pmc.manage edits and saves (schedule.saveStageMapping, audited); others read.
// Hidden for someone without project.pmc.read.
import React, { useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Select } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { projectErrorCode } from "@/lib/errorCode";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { projectErrorMessages } from "@shared/projectErrors";

type Anchor = "span" | "start" | "end";
type Draft = { stageCodes: string[]; anchor: Anchor; suggestedScore: number | null };

const text = {
  ar: { notLinked: "غير مربوطة", edit: "تعديل", close: "إغلاق", title: "ربط مراحل الجدول بمجموعات الأوزان", intro: "مرة لكل مشروع: أي مراحل جدول P6 (رموز Q Item) يتبعها تقدّم كل مجموعة أوزان المخطط. رموز Q في الجدول لا تعني ما تعنيه في ملف الأوزان، فالاقتراح بالاسم فقط ويراجعه شخص قبل الحفظ.", group: "مجموعة الأوزان", weight: "الوزن", stages: "مراحل الجدول", anchor: "طريقة الربط", suggestion: "اقتراح", use: "استخدم", useAll: "طبّق كل الاقتراحات", save: "احفظ الربط", saved: "حُفظ الربط.", ready: "الربط مكتمل: يمكن حساب المنحنى المخطط.", notReady: "يلزم ربط كل مجموعة وزنها أكبر من صفر قبل حساب المنحنى المخطط:", stale: "مراحل لم تعد في الجدول:", noSchedule: "لا جدول P6 مستورد لهذا المشروع بعد، أو لا أنشطة فيه مربوطة بفلل.", noGroups: "لا مجموعات أوزان في هذا المشروع بعد.", readOnly: "للقراءة: الحفظ يحتاج صلاحية إدارة ضبط المشروع (PMC).", activities: "نشاط", villas: "فيلا", anchors: { span: "على امتداد المراحل", start: "عند بداية المرحلة", end: "عند نهاية المرحلة" },
    differences: "الجدول مقابل فلل المشروع", matched: "فلل مطابقة", missing: "في الجدول وليست في المشروع", without: "في المشروع بلا أنشطة", unlinkedActivities: "أنشطة بلا فيلا", mismatch: "فروق النوع أو البلوك", field: { model: "النوع", block: "البلوك" }, inSchedule: "في الجدول", inProject: "في المشروع" },
  en: { notLinked: "Not linked", edit: "Edit", close: "Close", title: "Schedule stages linked to weight groups", intro: "Once per project: which stages of the P6 schedule (its Q Item codes) each weight group's planned progress follows. The schedule's Q codes do not mean what the weights file's mean, so the suggestion is by name only and a person reviews it before saving.", group: "Weight group", weight: "Weight", stages: "Schedule stages", anchor: "How it follows", suggestion: "Suggestion", use: "Use", useAll: "Apply all suggestions", save: "Save links", saved: "Links saved.", ready: "Every group is linked: the planned curve can be computed.", notReady: "Every group with a weight above zero must be linked before the planned curve is computed:", stale: "Stages no longer in the schedule:", noSchedule: "No P6 schedule has been imported for this project yet, or none of its activities belongs to a villa.", noGroups: "This project has no weight groups yet.", readOnly: "Read only: saving needs the PMC management permission.", activities: "activities", villas: "villas", anchors: { span: "Across the stages", start: "At the stage's start", end: "At the stage's finish" },
    differences: "Schedule against the project's villas", matched: "Villas matched", missing: "In the schedule, not in the project", without: "In the project, no activities", unlinkedActivities: "Activities without a villa", mismatch: "Type or block differs", field: { model: "Type", block: "Block" }, inSchedule: "schedule", inProject: "project" },
  ur: { notLinked: "ربط نہیں", edit: "ترمیم", close: "بند کریں", title: "شیڈول کے مراحل کا وزن کے گروپوں سے ربط", intro: "ہر منصوبے کے لیے ایک بار: ہر وزن گروپ کی منصوبہ بند پیش رفت P6 شیڈول کے کن مراحل (Q Item کوڈز) کے ساتھ چلتی ہے۔ شیڈول کے Q کوڈز کا مطلب وزن کی فائل والا نہیں، اس لیے تجویز صرف نام سے ہے اور محفوظ کرنے سے پہلے کوئی شخص اسے دیکھتا ہے۔", group: "وزن کا گروپ", weight: "وزن", stages: "شیڈول کے مراحل", anchor: "ربط کا طریقہ", suggestion: "تجویز", use: "استعمال کریں", useAll: "تمام تجاویز لاگو کریں", save: "ربط محفوظ کریں", saved: "ربط محفوظ ہو گیا۔", ready: "ہر گروپ جڑ گیا: منصوبہ بند منحنی کا حساب ہو سکتا ہے۔", notReady: "منصوبہ بند منحنی کے حساب سے پہلے صفر سے زیادہ وزن والے ہر گروپ کا ربط ضروری ہے:", stale: "مراحل جو اب شیڈول میں نہیں:", noSchedule: "اس منصوبے کے لیے ابھی کوئی P6 شیڈول درآمد نہیں ہوا، یا اس کی کوئی سرگرمی کسی ولا سے نہیں جڑی۔", noGroups: "اس منصوبے میں ابھی وزن کے گروپ نہیں۔", readOnly: "صرف پڑھنے کے لیے: محفوظ کرنے کے لیے PMC کے انتظام کی اجازت درکار ہے۔", activities: "سرگرمیاں", villas: "ولاز", anchors: { span: "مراحل کے دوران", start: "مرحلے کے آغاز پر", end: "مرحلے کے اختتام پر" },
    differences: "شیڈول بمقابلہ منصوبے کی ولاز", matched: "مطابق ولاز", missing: "شیڈول میں، منصوبے میں نہیں", without: "منصوبے میں، سرگرمیوں کے بغیر", unlinkedActivities: "ولا کے بغیر سرگرمیاں", mismatch: "قسم یا بلاک میں فرق", field: { model: "قسم", block: "بلاک" }, inSchedule: "شیڈول", inProject: "منصوبہ" },
};

const sameDraft = (a: Draft | undefined, b: Draft | undefined) => (a?.stageCodes.join(",") ?? "") === (b?.stageCodes.join(",") ?? "") && (a?.anchor ?? "span") === (b?.anchor ?? "span");
const numbers = (list: number[]) => list.length ? list.slice(0, 12).join(", ") + (list.length > 12 ? ` (+${list.length - 12})` : "") : "—";

export function ScheduleStageMapping({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canRead = useCan("project.pmc.read", projectId);
  const canEdit = useCan("project.pmc.manage", projectId);
  const utils = trpc.useUtils();
  const query = trpc.schedule.stageMapping.useQuery({ tenantId, projectId }, { enabled: canRead, retry: false });
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const save = trpc.schedule.saveStageMapping.useMutation({ onSuccess: async () => { setEdits({}); setDone(true); await utils.schedule.stageMapping.invalidate({ tenantId, projectId }); } });
  const data = query.data;
  const saved = useMemo(() => Object.fromEntries((data?.groups ?? []).filter(group => group.link).map(group => [group.id, { stageCodes: group.link!.stageCodes, anchor: group.link!.anchor as Anchor, suggestedScore: group.link!.suggestedScore }])) as Record<string, Draft>, [data]);
  if (!canRead || !data) return null;

  const current = (groupId: string): Draft => edits[groupId] ?? saved[groupId] ?? { stageCodes: [], anchor: "span", suggestedScore: null };
  const change = (groupId: string, next: Draft) => { setDone(false); setEdits(previous => ({ ...previous, [groupId]: next })); };
  const toggle = (groupId: string, code: string, on: boolean) => {
    const draft = current(groupId);
    const stageCodes = on ? (draft.anchor === "span" ? [...draft.stageCodes, code] : [code]) : draft.stageCodes.filter(item => item !== code);
    change(groupId, { ...draft, stageCodes, suggestedScore: null });
  };
  const changed = Object.entries(edits).filter(([groupId, draft]) => !sameDraft(draft, saved[groupId]));
  const suggestions = data.groups.filter(group => group.suggestion && !current(group.id).stageCodes.length);
  const errorCode = save.error ? projectErrorCode(save.error) : null;
  const errorText = save.error ? (errorCode && errorCode in projectErrorMessages ? projectErrorMessages[errorCode as keyof typeof projectErrorMessages][language] : save.error.message) : null;
  const d = data.differences;
  const stageName = new Map(data.stages.map(stage => [stage.code, stage.name]));

  return <Card data-stage-mapping>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardBody className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      {data.stages.length === 0 ? <p className="text-sm" data-stage-mapping-empty>{t.noSchedule}</p>
        : data.groups.length === 0 ? <p className="text-sm">{t.noGroups}</p>
        : <>
          <div data-stage-mapping-readiness={data.readiness.ready ? "ready" : "not-ready"} className="flex flex-col gap-1 text-sm">
            {data.readiness.ready ? <Badge tone="success">{t.ready}</Badge> : <>
              {data.readiness.unlinked.length ? <p>{t.notReady} <bdi dir="ltr">{data.readiness.unlinked.join(", ")}</bdi></p> : null}
              {data.readiness.stale.length ? <p className="text-destructive">{t.stale} {data.readiness.stale.map(item => <bdi key={item.groupCode} dir="ltr" className="me-2">{item.groupCode} ← {item.stageCodes.join("+")}</bdi>)}</p> : null}
            </>}
          </div>
          {!canEdit ? <p className="text-xs text-muted-foreground" data-stage-mapping-readonly>{t.readOnly}</p> : null}
          <div className="flex flex-col divide-y rounded border" data-stage-mapping-rows>
            {data.groups.map(group => {
              const draft = current(group.id);
              return <div key={group.id} className="flex flex-col gap-2 p-3 lg:flex-row lg:items-start lg:gap-4" data-group={group.code}>
                <div className="lg:w-56 lg:shrink-0">
                  <div className="font-medium"><bdi dir="ltr">{group.code}</bdi> · {language === "ar" ? group.name : group.nameEn ?? group.name}</div>
                  <div className="text-xs text-muted-foreground">{t.weight}: <bdi dir="ltr">{group.weight}%</bdi></div>
                  {group.suggestion && !draft.stageCodes.length ? <div className="mt-1 flex items-center gap-2 text-xs" data-suggestion={group.suggestion.stageCode}>
                    <Badge tone="info">{t.suggestion}: <bdi dir="ltr">{group.suggestion.stageCode}</bdi></Badge>
                    {canEdit ? <Button size="sm" variant="ghost" onClick={() => change(group.id, { stageCodes: [group.suggestion!.stageCode], anchor: "span", suggestedScore: group.suggestion!.score })}>{t.use}</Button> : null}
                  </div> : null}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-linked={draft.stageCodes.join("+")}>
                    {draft.stageCodes.length ? <>
                      {draft.stageCodes.map(code => <Badge key={code} tone="neutral"><bdi dir="ltr" className="font-medium">{code}</bdi> {stageName.get(code) ?? ""}</Badge>)}
                      <span className="text-xs text-muted-foreground">{t.anchors[draft.anchor]}</span>
                    </> : <span className="text-xs text-muted-foreground">{t.notLinked}</span>}
                    {canEdit ? <Button size="sm" variant="ghost" aria-expanded={open === group.id} onClick={() => setOpen(open === group.id ? null : group.id)} data-edit-group={group.code}>{open === group.id ? t.close : t.edit}</Button> : null}
                  </div>
                  {canEdit && open === group.id ? <div className="flex flex-col gap-2 rounded bg-muted/30 p-2" data-group-editor>
                    <div className="lg:w-64"><Select aria-label={t.anchor} value={draft.anchor} onValueChange={value => change(group.id, { ...draft, anchor: value as Anchor, stageCodes: value === "span" ? draft.stageCodes : draft.stageCodes.slice(0, 1) })}
                      options={(["span", "start", "end"] as const).map(value => ({ value, label: t.anchors[value] }))} /></div>
                    <div className="grid gap-x-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t.stages}>
                      {data.stages.map(stage => <Checkbox key={stage.code} checked={draft.stageCodes.includes(stage.code)} onCheckedChange={on => toggle(group.id, stage.code, on)} className="justify-start text-sm">
                        <span><bdi dir="ltr" className="font-medium">{stage.code}</bdi> <span className="text-muted-foreground">{stage.name}</span> <span className="text-xs text-muted-foreground">(<bdi dir="ltr">{stage.villas}</bdi> {t.villas})</span></span>
                      </Checkbox>)}
                    </div>
                  </div> : null}
                </div>
              </div>;
            })}
          </div>
          {canEdit ? <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={!suggestions.length} onClick={() => { setDone(false); setEdits(previous => ({ ...previous, ...Object.fromEntries(suggestions.map(group => [group.id, { stageCodes: [group.suggestion!.stageCode], anchor: "span" as Anchor, suggestedScore: group.suggestion!.score }])) })); }} data-apply-suggestions>{t.useAll}</Button>
            <Button disabled={!changed.length || save.isPending} onClick={() => save.mutate({ tenantId, projectId, links: changed.map(([groupId, draft]) => ({ groupId, stageCodes: draft.stageCodes, anchor: draft.anchor, suggestedScore: draft.suggestedScore })) })} data-save-stage-mapping>{t.save}{changed.length ? ` (${changed.length})` : ""}</Button>
            {done ? <span className="text-sm text-success" role="status">{t.saved}</span> : null}
            {errorText ? <span className="text-sm text-destructive" role="alert" data-stage-mapping-error>{errorText}</span> : null}
          </div> : null}
        </>}
      <div className="flex flex-col gap-2 border-t pt-3 text-sm" data-stage-mapping-differences>
        <div className="font-medium">{t.differences}</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{t.matched}: <bdi dir="ltr">{d.villasMatched}</bdi></Badge>
          <Badge tone={d.missingInProject.length ? "warning" : "neutral"}>{t.missing}: <bdi dir="ltr">{d.missingInProject.length}</bdi></Badge>
          <Badge tone={d.withoutActivities.length ? "warning" : "neutral"}>{t.without}: <bdi dir="ltr">{d.withoutActivities.length}</bdi></Badge>
          <Badge tone="neutral">{t.unlinkedActivities}: <bdi dir="ltr">{d.unlinkedActivities}</bdi></Badge>
          <Badge tone={d.mismatches.length ? "danger" : "neutral"}>{t.mismatch}: <bdi dir="ltr">{d.mismatches.length}</bdi></Badge>
        </div>
        {d.missingInProject.length ? <p className="text-xs text-muted-foreground">{t.missing}: <bdi dir="ltr">{numbers(d.missingInProject)}</bdi></p> : null}
        {d.withoutActivities.length ? <p className="text-xs text-muted-foreground">{t.without}: <bdi dir="ltr">{numbers(d.withoutActivities)}</bdi></p> : null}
        {d.mismatches.slice(0, 20).map(item => <p key={`${item.unitNumber}-${item.field}`} className="text-xs" data-mismatch={item.unitNumber}><bdi dir="ltr">{item.unitNumber}</bdi> · {t.field[item.field]}: {t.inSchedule} <bdi dir="ltr">{item.schedule}</bdi> / {t.inProject} <bdi dir="ltr">{item.project}</bdi></p>)}
      </div>
    </CardBody>
  </Card>;
}
