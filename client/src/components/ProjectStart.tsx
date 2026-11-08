import React from "react";
import { FileUp, PencilLine } from "lucide-react";
import { Button, Card, Stepper } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// Work order 21: an empty project says how to begin, in one card ("Start your project: upload the P6 programme, or the progress report, or add by
// hand"), and a bar of the steps that are left. The bar disappears once every step has data; the card only shows while nothing has been recorded.
const copy = {
  ar: {
    title: "ابدأ مشروعك", line: "ارفع برنامج P6، أو تقرير الإنجاز، أو أضف يدويًا.", p6: "ارفع برنامج P6", progressReport: "ارفع تقرير الإنجاز", manual: "أضف يدويًا",
    steps: "خطوات بدء المشروع", schedule: "البرنامج الزمني", budget: "الميزانية", progress: "الإنجاز",
    scheduleHint: "الأنشطة وتواريخها", budgetHint: "بنود الميزانية", progressHint: "أول تحديث للإنجاز",
  },
  en: {
    title: "Start your project", line: "Upload the P6 programme, or the progress report, or add by hand.", p6: "Upload the P6 programme", progressReport: "Upload the progress report", manual: "Add by hand",
    steps: "Project start steps", schedule: "Schedule", budget: "Budget", progress: "Progress",
    scheduleHint: "Activities and their dates", budgetHint: "Budget lines", progressHint: "The first progress update",
  },
  ur: {
    title: "اپنا پروجیکٹ شروع کریں", line: "P6 پروگرام اپ لوڈ کریں، یا پیش رفت کی رپورٹ، یا ہاتھ سے شامل کریں۔", p6: "P6 پروگرام اپ لوڈ کریں", progressReport: "پیش رفت کی رپورٹ اپ لوڈ کریں", manual: "ہاتھ سے شامل کریں",
    steps: "پروجیکٹ شروع کرنے کے مراحل", schedule: "شیڈول", budget: "بجٹ", progress: "پیش رفت",
    scheduleHint: "سرگرمیاں اور ان کی تاریخیں", budgetHint: "بجٹ کی مدیں", progressHint: "پیش رفت کی پہلی تازہ کاری",
  },
};

export type ProjectStartCounts = { activities: number; budgets: number; progress: number };

// The steps in order. A later step (e.g. "activate the project", D-42/D-43) is one more entry here: the bar, the current step and "all done" follow.
const STEPS = [
  { id: "schedule", has: (c: ProjectStartCounts) => c.activities > 0 },
  { id: "budget", has: (c: ProjectStartCounts) => c.budgets > 0 },
  { id: "progress", has: (c: ProjectStartCounts) => c.progress > 0 },
] as const;

/** The step a project is at: the first step that has nothing yet (STEPS.length when every step has data). */
export function projectStartStep(counts: ProjectStartCounts): number {
  const first = STEPS.findIndex(step => !step.has(counts));
  return first === -1 ? STEPS.length : first;
}

/** `onUpload` / `onManual` are left out for a person who may not import / may not write: their buttons are not shown (the server would refuse them). */
export function ProjectStart({ counts, onUpload, onManual }: { counts: ProjectStartCounts; onUpload?: () => void; onManual?: () => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, copy);
  const step = projectStartStep(counts);
  if (step >= STEPS.length) return null;
  const empty = counts.activities === 0 && counts.budgets === 0 && counts.progress === 0;
  const steps = STEPS.map(({ id }) => ({ id, label: t[id], description: t[`${id}Hint`] }));
  return (
    <Card as="section" aria-label={empty ? t.title : t.steps} data-project-start={empty ? "empty" : "steps"} className="flex flex-col gap-5 p-5 md:p-6">
      {empty ? (
        <div className="flex flex-col gap-4">
          <div><h2 className="text-xl font-semibold">{t.title}</h2><p className="mt-1 text-sm text-muted-foreground">{t.line}</p></div>
          {onUpload || onManual ? <div className="flex flex-wrap gap-2">
            {onUpload ? <Button icon={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={onUpload}>{t.p6}</Button> : null}
            {onUpload ? <Button variant="secondary" icon={<FileUp className="h-4 w-4" aria-hidden="true" />} onClick={onUpload}>{t.progressReport}</Button> : null}
            {onManual ? <Button variant="secondary" icon={<PencilLine className="h-4 w-4" aria-hidden="true" />} onClick={onManual}>{t.manual}</Button> : null}
          </div> : null}
        </div>
      ) : null}
      <Stepper label={t.steps} steps={steps} current={step} />
    </Card>
  );
}
