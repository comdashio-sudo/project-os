// Q-23 (the rest): two schedule updates compared, on the live schedule screen. The person picks two snapshots of the project (by default the one before the
// latest and the latest); everything shown comes from schedule.compare (server/scheduleSnapshots.ts): what was added, removed, started, finished, moved, and
// what became or stopped being critical. Read-only; nothing is computed here that the server did not return.
import React, { useState } from "react";
import { Badge, Card, CardBody, CardHeader, CardTitle, Field, Select } from "@/components/ds";
import { formatDate } from "@/components/ds/format";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

type Snapshot = { id: string; source: string; dataDate: Date | string | null; createdAt: Date | string };
type Kind = "added" | "removed" | "started" | "finished" | "finish_moved" | "start_moved" | "became_critical" | "no_longer_critical" | "status";

const text = {
  ar: { title: "مقارنة تحديثين", from: "من", to: "إلى", same: "اختر لقطتين مختلفتين.", none: "لا تغيير بين التحديثين.", code: "النشاط", what: "ما تغيّر", finishBefore: "النهاية قبل", finishAfter: "النهاية بعد", moved: "تحرّك النهاية (يوم)",
    summary: { changed: "تغيّر", added: "أُضيف", removed: "حُذف", started: "بدأ", finished: "انتهى", finishLater: "تأخرت نهايته", finishEarlier: "تقدّمت نهايته", becameCritical: "صار حرجًا", noLongerCritical: "لم يعد حرجًا" },
    kind: { added: "مضاف", removed: "محذوف", started: "بدأ", finished: "انتهى", finish_moved: "تحرّكت النهاية", start_moved: "تحرّكت البداية", became_critical: "صار حرجًا", no_longer_critical: "لم يعد حرجًا", status: "تغيّرت الحالة" } },
  en: { title: "Compare two updates", from: "From", to: "To", same: "Pick two different snapshots.", none: "Nothing changed between the two updates.", code: "Activity", what: "What changed", finishBefore: "Finish before", finishAfter: "Finish after", moved: "Finish moved (days)",
    summary: { changed: "Changed", added: "Added", removed: "Removed", started: "Started", finished: "Finished", finishLater: "Finishing later", finishEarlier: "Finishing earlier", becameCritical: "Became critical", noLongerCritical: "No longer critical" },
    kind: { added: "Added", removed: "Removed", started: "Started", finished: "Finished", finish_moved: "Finish moved", start_moved: "Start moved", became_critical: "Became critical", no_longer_critical: "No longer critical", status: "Status changed" } },
  ur: { title: "دو اپڈیٹس کا موازنہ", from: "سے", to: "تک", same: "دو مختلف اسنیپ شاٹس منتخب کریں۔", none: "دونوں اپڈیٹس کے درمیان کوئی تبدیلی نہیں۔", code: "سرگرمی", what: "کیا بدلا", finishBefore: "پہلے اختتام", finishAfter: "بعد میں اختتام", moved: "اختتام میں تبدیلی (دن)",
    summary: { changed: "بدلی", added: "شامل", removed: "حذف", started: "شروع", finished: "ختم", finishLater: "اختتام مؤخر", finishEarlier: "اختتام مقدم", becameCritical: "اہم بن گئی", noLongerCritical: "اب اہم نہیں" },
    kind: { added: "شامل", removed: "حذف", started: "شروع", finished: "ختم", finish_moved: "اختتام بدلا", start_moved: "آغاز بدلا", became_critical: "اہم بن گئی", no_longer_critical: "اب اہم نہیں", status: "حالت بدلی" } },
};

export function ScheduleCompare({ tenantId, projectId, snapshots, sourceLabel }: { tenantId: string; projectId: string; snapshots: Snapshot[]; sourceLabel: (source: string) => string }) {
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  // the server lists the snapshots newest first
  const [toId, setToId] = useState(snapshots[0]?.id ?? "");
  const [fromId, setFromId] = useState(snapshots[1]?.id ?? "");
  const ready = Boolean(fromId && toId && fromId !== toId);
  const query = trpc.schedule.compare.useQuery({ tenantId, projectId, fromSnapshotId: fromId, toSnapshotId: toId }, { enabled: ready });
  if (snapshots.length < 2) return null;
  const date = (value: Date | string | null | undefined) => (value ? formatDate(new Date(value), language) : "—");
  const options = snapshots.map(snapshot => ({ value: snapshot.id, label: `${date(snapshot.dataDate ?? snapshot.createdAt)} · ${sourceLabel(snapshot.source)}` }));
  const data = query.data;

  return <Card data-schedule-compare>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardBody className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.from}>{props => <Select id={props.id} value={fromId} onValueChange={setFromId} options={options} />}</Field>
        <Field label={t.to}>{props => <Select id={props.id} value={toId} onValueChange={setToId} options={options} />}</Field>
      </div>
      {!ready ? <p className="text-sm text-muted-foreground" data-compare-same>{t.same}</p> : <>
        <SourceNotice query={query} isArabic={isArabic} title={t.title} />
        {data && <>
          <div className="flex flex-wrap gap-2" data-compare-summary>{(Object.keys(t.summary) as Array<keyof typeof t.summary>).map(key => <Badge key={key} tone={key === "becameCritical" || key === "finishLater" ? "danger" : "neutral"}>{t.summary[key]}: <bdi dir="ltr">{data.summary[key]}</bdi></Badge>)}</div>
          {data.changes.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-compare-rows>
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start">{t.code}</th><th className="p-2 text-start">{t.what}</th><th className="p-2 text-start">{t.finishBefore}</th><th className="p-2 text-start">{t.finishAfter}</th><th className="p-2 text-start">{t.moved}</th></tr></thead>
              <tbody>{data.changes.map(change => <tr key={change.activityId} className="border-b" data-change={change.code}>
                <td className="p-2 font-medium"><bdi dir="ltr">{change.code}</bdi></td>
                <td className="p-2"><div className="flex flex-wrap gap-1">{change.kinds.map(kind => <Badge key={kind} tone={kind === "became_critical" ? "danger" : "neutral"}>{t.kind[kind as Kind]}</Badge>)}</div></td>
                <td className="p-2">{date(change.from?.actualFinish ?? change.from?.plannedFinish)}</td>
                <td className="p-2">{date(change.to?.actualFinish ?? change.to?.plannedFinish)}</td>
                <td className={`p-2 ${(change.finishMovedDays ?? 0) > 0 ? "font-semibold text-destructive" : ""}`}>{change.finishMovedDays === null ? "—" : <bdi dir="ltr">{change.finishMovedDays > 0 ? `+${change.finishMovedDays}` : change.finishMovedDays}</bdi>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </>}
      </>}
    </CardBody>
  </Card>;
}
