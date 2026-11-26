// Q-61 (5): on the live schedule screen, the project's P6 imports and which one is the baseline. The first confirmed import is the baseline; a later one
// (the version approved after the one submitted) becomes it only by «Adopt this import as the new baseline» — for whoever manages the schedule or the project,
// with a reason, audited (schedule.adoptBaseline). The previous baseline stays a snapshot; the activity updates stay forecasts and are not offered.
import React, { useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, TextArea } from "@/components/ds";
import { formatDate } from "@/components/ds/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { projectErrorCode } from "@/lib/errorCode";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { projectErrorMessages } from "@shared/projectErrors";

type Snapshot = { id: string; source: string; dataDate: Date | string | null; isBaseline: boolean; createdAt: Date | string };
const text = {
  ar: { title: "خط الأساس والاستيرادات", intro: "أول استيراد P6 مؤكَّد هو خط الأساس. يصير استيراد لاحق خط الأساس الجديد بقرار صريح فقط، بسبب مكتوب ومسجَّل في التدقيق؛ والسابق يبقى لقطة، وتحديثات الأنشطة تبقى توقعًا.", baseline: "خط الأساس", imported: "استُورد", dataDate: "تاريخ البيانات", adopt: "اعتماد هذا الاستيراد خط أساس جديد", reason: "السبب", reasonHint: "مثلًا: النسخة المعتمدة من الاستشاري تحل محل المقدّمة (خمسة أحرف على الأقل).", confirm: "اعتمد خط الأساس الجديد", cancel: "إلغاء", done: "اعتُمد خط الأساس الجديد.", only: "استيراد واحد فقط؛ لا شيء آخر يُعتمد." },
  en: { title: "Baseline and imports", intro: "The first confirmed P6 import is the baseline. A later import becomes the new baseline only by an explicit decision, with a written reason recorded in the audit; the previous one stays a snapshot, and activity updates stay forecasts.", baseline: "Baseline", imported: "Imported", dataDate: "Data date", adopt: "Adopt this import as the new baseline", reason: "Reason", reasonHint: "For example: the version the consultant approved replaces the one submitted (at least five characters).", confirm: "Adopt the new baseline", cancel: "Cancel", done: "The new baseline was adopted.", only: "Only one import; there is nothing else to adopt." },
  ur: { title: "بنیادی منصوبہ اور درآمدات", intro: "پہلی تصدیق شدہ P6 درآمد بنیادی منصوبہ ہے۔ بعد کی درآمد صرف واضح فیصلے سے، تحریری وجہ کے ساتھ جو آڈٹ میں درج ہو، نیا بنیادی منصوبہ بنتی ہے؛ پچھلا اسنیپ شاٹ رہتا ہے، اور سرگرمیوں کی تازہ کاریاں پیش گوئی رہتی ہیں۔", baseline: "بنیادی منصوبہ", imported: "درآمد", dataDate: "ڈیٹا کی تاریخ", adopt: "اس درآمد کو نیا بنیادی منصوبہ منظور کریں", reason: "وجہ", reasonHint: "مثلاً: کنسلٹنٹ کا منظور شدہ نسخہ پیش کردہ کی جگہ لیتا ہے (کم از کم پانچ حروف)۔", confirm: "نیا بنیادی منصوبہ منظور کریں", cancel: "منسوخ", done: "نیا بنیادی منصوبہ منظور ہو گیا۔", only: "صرف ایک درآمد؛ منظور کرنے کو کچھ اور نہیں۔" },
};

export function ScheduleBaselineAdopt({ tenantId, projectId, snapshots }: { tenantId: string; projectId: string; snapshots: Snapshot[] }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canAdopt = useCan(["project.schedule.manage", "project.manage"], projectId);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const adopt = trpc.schedule.adoptBaseline.useMutation({ onSuccess: async () => { setOpen(null); setReason(""); setDone(true); await Promise.all([utils.schedule.live.invalidate({ tenantId, projectId }), utils.schedule.plannedCurve.invalidate({ tenantId, projectId })]); } });
  const imports = snapshots.filter(snapshot => snapshot.source === "p6_import");
  if (!imports.length) return null;
  const date = (value: Date | string | null) => (value ? formatDate(new Date(value), language) : "—");
  const code = adopt.error ? projectErrorCode(adopt.error) : null;
  const errorText = adopt.error ? (code && code in projectErrorMessages ? projectErrorMessages[code as keyof typeof projectErrorMessages][language] : adopt.error.message) : null;

  return <Card data-baseline-adopt>
    <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
    <CardBody className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      <div className="flex flex-col divide-y rounded border">
        {imports.map(snapshot => <div key={snapshot.id} className="flex flex-col gap-2 p-3" data-import={snapshot.id} data-is-baseline={snapshot.isBaseline ? "true" : undefined}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t.imported}: <strong>{date(snapshot.createdAt)}</strong></span>
            <span className="text-muted-foreground">· {t.dataDate}: {date(snapshot.dataDate)}</span>
            {snapshot.isBaseline ? <Badge tone="success">{t.baseline}</Badge> : canAdopt && open !== snapshot.id ? <Button size="sm" variant="secondary" onClick={() => { setOpen(snapshot.id); setDone(false); adopt.reset(); }} data-adopt={snapshot.id}>{t.adopt}</Button> : null}
          </div>
          {open === snapshot.id ? <div className="flex flex-col gap-2" data-adopt-form>
            <Field label={t.reason} hint={t.reasonHint} required>{props => <TextArea id={props.id} aria-describedby={props["aria-describedby"]} rows={2} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />}</Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={reason.trim().length < 5 || adopt.isPending} onClick={() => adopt.mutate({ tenantId, projectId, snapshotId: snapshot.id, reason })} data-confirm-adopt>{t.confirm}</Button>
              <Button variant="ghost" onClick={() => { setOpen(null); setReason(""); }}>{t.cancel}</Button>
            </div>
            {errorText ? <p className="text-sm text-destructive" role="alert" data-adopt-error>{errorText}</p> : null}
          </div> : null}
        </div>)}
      </div>
      {imports.length === 1 ? <p className="text-xs text-muted-foreground">{t.only}</p> : null}
      {done ? <p className="text-sm text-success" role="status">{t.done}</p> : null}
    </CardBody>
  </Card>;
}
