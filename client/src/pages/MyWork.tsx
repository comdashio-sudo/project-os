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
    ar: { title: "مهامي", intro: "ما ينتظرك في هذه الشركة: المهام المسندة إليك، والقرارات التي خطوتها التالية عندك.", actions: "مهامي المفتوحة", noActions: "لا مهام مفتوحة مسندة إليك.", due: "الاستحقاق", noDue: "بلا تاريخ", overdue: "متأخرة", done: "إنجاز المهمة", decisions: "قرارات بانتظاري", noDecisions: "لا قرار ينتظر خطوة منك.", decisionText: "نص القرار أو سبب الرفض", steps: { submitted: "رفع للقرار", approved: "اعتماد", rejected: "رفض", implemented: "تم التنفيذ" }, loading: "جارٍ التحميل…", saved: "تم." },
    en: { title: "My work", intro: "What waits on you in this company: the actions assigned to you, and the decisions whose next step is yours.", actions: "My open actions", noActions: "No open action is assigned to you.", due: "Due", noDue: "No date", overdue: "Overdue", done: "Mark done", decisions: "Decisions waiting on me", noDecisions: "No decision waits on a step from you.", decisionText: "The decision's text, or the reason to reject", steps: { submitted: "Submit for decision", approved: "Approve", rejected: "Reject", implemented: "Implemented" }, loading: "Loading…", saved: "Done." },
    ur: { title: "میرے کام", intro: "اس کمپنی میں جو آپ کا منتظر ہے: آپ کو سونپے گئے کام، اور وہ فیصلے جن کا اگلا قدم آپ کا ہے۔", actions: "میرے کھلے کام", noActions: "آپ کو کوئی کھلا کام نہیں سونپا گیا۔", due: "مقررہ تاریخ", noDue: "تاریخ نہیں", overdue: "تاخیر", done: "کام مکمل کریں", decisions: "میرے منتظر فیصلے", noDecisions: "کوئی فیصلہ آپ کے قدم کا منتظر نہیں۔", decisionText: "فیصلے کا متن یا مسترد کرنے کی وجہ", steps: { submitted: "فیصلے کے لیے پیش کریں", approved: "منظور", rejected: "مسترد", implemented: "نافذ ہو گیا" }, loading: "لوڈ ہو رہا ہے…", saved: "ہو گیا۔" },
  });
  const work = trpc.executive.myWork.useQuery({ tenantId });
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const complete = trpc.executive.completeMyAction.useMutation({ onSuccess: () => { setNotice(t.saved); void work.refetch(); } });
  const transition = trpc.executive.transitionDecision.useMutation({ onSuccess: () => { setNotice(t.saved); void work.refetch(); } });
  const failure = complete.error ?? transition.error;
  return <ProductShell tenantId={tenantId}>
    <PageMain className="mx-auto grid w-full max-w-4xl gap-5 p-4 md:p-8">
      <header className="grid gap-1"><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-sm text-muted-foreground">{t.intro}</p></header>
      <SourceNotice query={work} isArabic={isArabic} title={t.title} />
      {work.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {failure ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(failure, isArabic)}</p> : null}
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
