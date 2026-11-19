import React, { useState } from "react";
import { useParams } from "wouter";
import { formatDate } from "@/components/ds/format";
import { PageMain } from "@/components/pageFrame";
import { ProductShell } from "@/components/ProductShell";
import { SourceNotice } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { enumLabel } from "@/lib/labels";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

type Step = "submitted" | "approved" | "rejected" | "implemented";

/**
 * Q-45 (c, adviser 18-11): «مهامي» — what waits on me in this company: the actions I own that are still open (with «إنجاز المهمة»), and the decisions whose
 * next step is mine (submit what I recorded, decide what I own — a decision text, and a reason to reject — implement what was approved). The server decides
 * who may take each step (server/myWork.ts, server/db.ts transitionDecision); this page shows only the steps it returned. Q-25's meeting tasks join here later.
 */
export default function MyWork() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { title: "مهامي", intro: "ما ينتظرك في هذه الشركة: المهام المسندة إليك، والقرارات التي خطوتها التالية عندك.", actions: "مهامي المفتوحة", noActions: "لا مهام مفتوحة مسندة إليك.", due: "الاستحقاق", noDue: "بلا تاريخ", overdue: "متأخرة", done: "إنجاز المهمة", decisions: "قرارات بانتظاري", noDecisions: "لا قرار ينتظر خطوة منك.", decisionText: "نص القرار أو سبب الرفض", steps: { submitted: "رفع للقرار", approved: "اعتماد", rejected: "رفض", implemented: "تم التنفيذ" }, loading: "جارٍ التحميل…", saved: "تم.", late: "متأخر عن موعده", noLate: "لا شيء متأخر عن موعده في مشاريعك.", lateIntro: "ما يصلك في ملخص الصباح اليومي، محسوبًا الآن.", lateActivities: "أنشطة حرجة متأخرة", lateActions: "مهام متأخرة", lateRfis: "طلبات معلومات RFI متأخرة", lateSubmittals: "تقديمات للاستشاري بلا رد", days: "يوم تأخير", company: "مهام الشركة" },
    en: { title: "My work", intro: "What waits on you in this company: the actions assigned to you, and the decisions whose next step is yours.", actions: "My open actions", noActions: "No open action is assigned to you.", due: "Due", noDue: "No date", overdue: "Overdue", done: "Mark done", decisions: "Decisions waiting on me", noDecisions: "No decision waits on a step from you.", decisionText: "The decision's text, or the reason to reject", steps: { submitted: "Submit for decision", approved: "Approve", rejected: "Reject", implemented: "Implemented" }, loading: "Loading…", saved: "Done.", late: "Past its due date", noLate: "Nothing is past its due date in your projects.", lateIntro: "What the morning summary sends you, counted now.", lateActivities: "Late critical activities", lateActions: "Overdue actions", lateRfis: "Overdue RFIs", lateSubmittals: "Submittals awaiting the consultant", days: "day(s) late", company: "Company actions" },
    ur: { title: "میرے کام", intro: "اس کمپنی میں جو آپ کا منتظر ہے: آپ کو سونپے گئے کام، اور وہ فیصلے جن کا اگلا قدم آپ کا ہے۔", actions: "میرے کھلے کام", noActions: "آپ کو کوئی کھلا کام نہیں سونپا گیا۔", due: "مقررہ تاریخ", noDue: "تاریخ نہیں", overdue: "تاخیر", done: "کام مکمل کریں", decisions: "میرے منتظر فیصلے", noDecisions: "کوئی فیصلہ آپ کے قدم کا منتظر نہیں۔", decisionText: "فیصلے کا متن یا مسترد کرنے کی وجہ", steps: { submitted: "فیصلے کے لیے پیش کریں", approved: "منظور", rejected: "مسترد", implemented: "نافذ ہو گیا" }, loading: "لوڈ ہو رہا ہے…", saved: "ہو گیا۔", late: "مقررہ تاریخ سے مؤخر", noLate: "آپ کے پروجیکٹس میں کچھ بھی مقررہ تاریخ سے مؤخر نہیں۔", lateIntro: "صبح کا روزانہ خلاصہ جو آپ کو بھیجتا ہے، ابھی شمار کیا گیا۔", lateActivities: "مؤخر اہم سرگرمیاں", lateActions: "مؤخر کام", lateRfis: "مؤخر RFI", lateSubmittals: "کنسلٹنٹ کے جواب کے منتظر سبمٹلز", days: "دن تاخیر", company: "کمپنی کے کام" },
  });
  const work = trpc.executive.myWork.useQuery({ tenantId });
  // Q-26 (P-119): what is overdue for me, by the daily digest's own rule (server/deadlineAlerts.ts)
  const deadlines = trpc.executive.myDeadlines.useQuery({ tenantId });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const complete = trpc.executive.completeMyAction.useMutation({ onSuccess: () => { setNotice(t.saved); void work.refetch(); } });
  const transition = trpc.executive.transitionDecision.useMutation({ onSuccess: () => { setNotice(t.saved); void work.refetch(); } });
  const failure = complete.error ?? transition.error;
  return <ProductShell tenantId={tenantId}>
    <PageMain className="mx-auto grid w-full max-w-4xl gap-5 p-4 md:p-8">
      <header className="grid gap-1"><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-sm text-muted-foreground">{t.intro}</p></header>
      <SourceNotice query={work} isArabic={isArabic} title={t.title} />
      <SourceNotice query={deadlines} isArabic={isArabic} title={t.late} />
      {work.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {failure ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(failure, isArabic)}</p> : null}
      {deadlines.data ? <Card data-my-deadlines><CardHeader><CardTitle>{t.late}</CardTitle><p className="text-sm text-muted-foreground">{t.lateIntro}</p></CardHeader><CardContent className="grid gap-3">
        {deadlines.data.counts.total === 0 ? <p className="text-sm text-muted-foreground">{t.noLate}</p> : deadlines.data.projects.map(project => {
          const groups: Array<[string, string, Array<{ id: string; label: string; daysLate: number }>]> = [
            ["activities", t.lateActivities, project.activities.map(item => ({ id: item.id, label: `${item.code} ${item.name}`, daysLate: item.daysLate }))],
            ["actions", t.lateActions, project.actions.map(item => ({ id: item.id, label: item.title, daysLate: item.daysLate }))],
            ["rfis", t.lateRfis, project.rfis.map(item => ({ id: item.id, label: `${item.number} ${item.title}`, daysLate: item.daysLate }))],
            ["submittals", t.lateSubmittals, project.submittals.map(item => ({ id: item.id, label: `${item.number} ${item.title}`, daysLate: item.daysLate }))],
          ];
          return <section key={project.projectId || "company"} data-deadline-project={project.projectId || "company"} className="grid gap-2 rounded-lg border p-3 text-sm">
            <strong>{project.code ? `${project.code} · ${project.name}` : t.company}</strong>
            {groups.filter(([, , items]) => items.length > 0).map(([key, title, items]) => <div key={key} data-deadline-group={key} className="grid gap-1">
              <span className="font-semibold">{title}: <bdi dir="ltr">{items.length}</bdi></span>
              <ul className="grid gap-1 ps-4">{items.map(item => <li key={item.id} className="list-disc">{item.label} — <span className="font-semibold text-red-700"><bdi dir="ltr">{item.daysLate}</bdi> {t.days}</span></li>)}</ul>
            </div>)}
          </section>;
        })}
      </CardContent></Card> : null}
      {work.data ? <>
        <Card data-my-actions><CardHeader><CardTitle>{t.actions}</CardTitle></CardHeader><CardContent className="grid gap-2">
          {work.data.actions.length === 0 ? <p className="text-sm text-muted-foreground">{t.noActions}</p> : work.data.actions.map(action => (
            <div key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="grid gap-1"><strong>{action.title}</strong><span className="text-muted-foreground">{action.projectCode ?? "—"} · {enumLabel(action.priority, language)} · {t.due}: {action.dueAt ? formatDate(action.dueAt, language) : t.noDue}{action.overdue ? <span className="ms-2 font-semibold text-red-700">{t.overdue}</span> : null}</span></div>
              <Button className="min-h-11" disabled={complete.isPending} onClick={() => { setNotice(null); complete.mutate({ tenantId, actionId: action.id }); }}>{t.done}</Button>
            </div>
          ))}
        </CardContent></Card>
        <Card data-my-decisions><CardHeader><CardTitle>{t.decisions}</CardTitle></CardHeader><CardContent className="grid gap-3">
          {work.data.decisions.length === 0 ? <p className="text-sm text-muted-foreground">{t.noDecisions}</p> : work.data.decisions.map(decision => {
            const deciding = decision.steps.includes("approved");
            return <div key={decision.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="grid gap-1"><strong>{decision.problem}</strong><span className="text-muted-foreground">{decision.projectCode ?? "—"} · {enumLabel(decision.status, language)}</span></div>
              {deciding ? <label className="grid gap-1"><span className="text-xs text-muted-foreground">{t.decisionText}</span><Textarea value={texts[decision.id] ?? ""} maxLength={5000} onChange={event => setTexts({ ...texts, [decision.id]: event.target.value })} /></label> : null}
              <div className="flex flex-wrap gap-2">{(decision.steps as Step[]).map(step => (
                <Button key={step} variant={step === "rejected" ? "outline" : "default"} className="min-h-11" disabled={transition.isPending || !decision.projectId}
                  onClick={() => { setNotice(null); if (decision.projectId) transition.mutate({ tenantId, projectId: decision.projectId, decisionId: decision.id, nextStatus: step, decision: deciding ? texts[decision.id] : undefined }); }}>{t.steps[step]}</Button>
              ))}</div>
            </div>;
          })}
        </CardContent></Card>
      </> : null}
    </PageMain>
  </ProductShell>;
}
