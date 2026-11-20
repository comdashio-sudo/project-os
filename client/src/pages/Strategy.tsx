import React from "react";
import { useParams } from "wouter";
import { formatAmount, formatDate, formatNumber } from "@/components/ds/format";
import { PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { enumLabel } from "@/lib/labels";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";

const TEXT = {
  ar: {
    title: "مركز التخطيط الاستراتيجي", intro: "الافتراضات المعتمدة التي يقرأ منها النموذج، وخط الفرص ونسبة الفوز الفعلية، والأهداف ومبادراتها، والانحراف بين ما افترضناه وما حدث. كل رقم هنا محسوب في الخادم من سجلات الشركة؛ لا رقم مكتوب باليد في النتائج.",
    assumptions: "سجل الافتراضات", noAssumptions: "لا افتراضات بعد.", base: "الأساسي", conservative: "المتحفظ", optimistic: "المتفائل", confidence: "الثقة", nextReview: "المراجعة القادمة", pendingChange: "طلب تغيير بانتظار الاعتماد",
    pipeline: "خط الفرص", inPlay: "فرص قائمة", weighted: "القيمة المرجّحة بالاحتمال", winRate: "نسبة الفوز الفعلية", decided: "محسومة", won: "فزنا بها", noWinRate: "لا فرص حُسمت خلال آخر 12 شهرًا", lostTo: "خسرناها لصالح",
    goals: "الأهداف والمبادرات", noGoals: "لا أهداف بعد.", target: "الهدف", period: "الفترة", initiatives: "المبادرات", noInitiatives: "لا مبادرات لهذا الهدف.", due: "الاستحقاق", unlinked: "مبادرات غير مربوطة بهدف",
    variances: "الانحرافات (المفترض مقابل الفعلي)", noVariances: "لا انحرافات مسجّلة بعد.", assumed: "المفترض", actual: "الفعلي", difference: "الفرق", sample: "عدد العناصر", source: "مصدر الفعلي", pipelineSource: "من الفرص المحسومة", manualSource: "مُدخل يدويًا", recurring: "يتكرر", decision: "القرار", undecided: "بانتظار القرار",
    sar: "ريال", months: "شهر", days: "يوم",
  },
  en: {
    title: "Strategy centre", intro: "The approved assumptions the model reads, the opportunities pipeline and the actual win rate, the goals and their initiatives, and the variance between what we assumed and what happened. Every figure here is computed on the server from the company's records; nothing in the results is typed by hand.",
    assumptions: "Assumptions register", noAssumptions: "No assumptions yet.", base: "Base", conservative: "Conservative", optimistic: "Optimistic", confidence: "Confidence", nextReview: "Next review", pendingChange: "A change request awaits approval",
    pipeline: "Opportunities pipeline", inPlay: "Opportunities in play", weighted: "Value weighted by probability", winRate: "Actual win rate", decided: "decided", won: "won", noWinRate: "No opportunity decided in the last 12 months", lostTo: "Lost to",
    goals: "Goals and initiatives", noGoals: "No goals yet.", target: "Target", period: "Period", initiatives: "Initiatives", noInitiatives: "No initiatives for this goal.", due: "Due", unlinked: "Initiatives not linked to a goal",
    variances: "Variances (assumed against actual)", noVariances: "No variances recorded yet.", assumed: "Assumed", actual: "Actual", difference: "Difference", sample: "Items", source: "Actual from", pipelineSource: "decided opportunities", manualSource: "entered by hand", recurring: "Recurs", decision: "Decision", undecided: "Awaiting a decision",
    sar: "SAR", months: "months", days: "days",
  },
  ur: {
    title: "اسٹریٹجک منصوبہ بندی کا مرکز", intro: "منظور شدہ مفروضے جن سے ماڈل پڑھتا ہے، مواقع کی پائپ لائن اور اصل جیت کی شرح، اہداف اور ان کے اقدامات، اور جو ہم نے فرض کیا اور جو ہوا اس کا فرق۔ یہاں ہر عدد سرور پر کمپنی کے ریکارڈ سے حساب ہوتا ہے؛ نتائج میں کچھ بھی ہاتھ سے نہیں لکھا جاتا۔",
    assumptions: "مفروضوں کا رجسٹر", noAssumptions: "ابھی کوئی مفروضہ نہیں۔", base: "بنیادی", conservative: "محتاط", optimistic: "پرامید", confidence: "اعتماد", nextReview: "اگلا جائزہ", pendingChange: "تبدیلی کی درخواست منظوری کی منتظر",
    pipeline: "مواقع کی پائپ لائن", inPlay: "جاری مواقع", weighted: "امکان سے وزنی قدر", winRate: "اصل جیت کی شرح", decided: "فیصلہ شدہ", won: "جیتے", noWinRate: "پچھلے 12 ماہ میں کوئی موقع طے نہیں ہوا", lostTo: "ہارے بمقابلہ",
    goals: "اہداف اور اقدامات", noGoals: "ابھی کوئی ہدف نہیں۔", target: "ہدف", period: "مدت", initiatives: "اقدامات", noInitiatives: "اس ہدف کے لیے کوئی اقدام نہیں۔", due: "مقررہ تاریخ", unlinked: "ہدف سے غیر منسلک اقدامات",
    variances: "فرق (فرض شدہ بمقابلہ اصل)", noVariances: "ابھی کوئی فرق درج نہیں۔", assumed: "فرض شدہ", actual: "اصل", difference: "فرق", sample: "عناصر", source: "اصل کا ماخذ", pipelineSource: "طے شدہ مواقع", manualSource: "ہاتھ سے درج", recurring: "دہرایا جاتا ہے", decision: "فیصلہ", undecided: "فیصلے کا منتظر",
    sar: "ریال", months: "ماہ", days: "دن",
  },
} satisfies Record<Language, Record<string, string>>;
type Text = (typeof TEXT)["ar"];
type Unit = "percent" | "sar" | "months" | "days" | "count";

/** A value in its unit, in Western digits and isolated left-to-right inside the Arabic line. */
function Value({ value, unit, t }: { value: number; unit: Unit; t: Text }) {
  const text = unit === "percent" ? `${formatNumber(value, 2)}%` : unit === "sar" ? `${formatAmount(value)} ${t.sar}` : unit === "count" ? formatNumber(value, 2) : `${formatNumber(value, 2)} ${t[unit]}`;
  return <bdi dir="ltr">{text}</bdi>;
}
const Chip = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{children}</span>;
const Empty = ({ children, name }: { children: React.ReactNode; name: string }) => <p className="text-sm text-muted-foreground" data-strategy-empty={name}>{children}</p>;

function Assumptions({ tenantId, t, language }: { tenantId: string; t: Text; language: Language }) {
  const query = trpc.strategy.assumptions.useQuery({ tenantId });
  return <Card data-strategy-section="assumptions">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t.assumptions}</CardTitle></CardHeader>
    <CardContent className="grid gap-2">
      <SourceNotice query={query} isArabic={language === "ar"} title={t.assumptions} />
      {query.data && !query.data.length ? <Empty name="assumptions">{t.noAssumptions}</Empty> : null}
      {query.data?.map(item => <div key={item.id} data-strategy-assumption={item.code} className="grid gap-1 rounded-[var(--radius-md)] border border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><bdi>{item.code}</bdi><span>· {item.name}</span><Chip>{enumLabel(item.status, language)}</Chip></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{t.base} <strong><Value value={item.values.base} unit={item.unit} t={t} /></strong></span>
          <span className="text-muted-foreground">{t.conservative} <Value value={item.values.conservative} unit={item.unit} t={t} /></span>
          <span className="text-muted-foreground">{t.optimistic} <Value value={item.values.optimistic} unit={item.unit} t={t} /></span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t.confidence}: {enumLabel(item.confidence, language)}</span>
          {item.nextReviewAt ? <span>{t.nextReview}: <bdi>{formatDate(item.nextReviewAt, language)}</bdi></span> : null}
          {item.pendingChange ? <span className="text-warning-soft-foreground" data-strategy-pending>{t.pendingChange}</span> : null}
        </div>
      </div>)}
    </CardContent>
  </Card>;
}

function Pipeline({ tenantId, t, language }: { tenantId: string; t: Text; language: Language }) {
  const query = trpc.strategy.pipeline.useQuery({ tenantId });
  const data = query.data;
  return <Card data-strategy-section="pipeline">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t.pipeline}</CardTitle></CardHeader>
    <CardContent className="grid gap-2">
      <SourceNotice query={query} isArabic={language === "ar"} title={t.pipeline} />
      {data ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="grid gap-0.5 rounded-[var(--radius-md)] border border-border px-3 py-2"><span className="text-xs text-muted-foreground">{t.inPlay}</span><span className="text-base font-semibold"><bdi dir="ltr">{formatNumber(data.inPlay.count)}</bdi> · <bdi dir="ltr">{formatAmount(data.inPlay.value)} {t.sar}</bdi></span></div>
        <div className="grid gap-0.5 rounded-[var(--radius-md)] border border-border px-3 py-2"><span className="text-xs text-muted-foreground">{t.weighted}</span><span className="text-base font-semibold"><bdi dir="ltr">{formatAmount(data.inPlay.weighted)} {t.sar}</bdi></span></div>
        <div className="grid gap-0.5 rounded-[var(--radius-md)] border border-border px-3 py-2" data-strategy-win-rate><span className="text-xs text-muted-foreground">{t.winRate}</span>
          {data.winRate.byCount === null ? <span className="text-sm text-muted-foreground">{t.noWinRate}</span>
            : <span className="text-base font-semibold"><bdi dir="ltr">{formatNumber(data.winRate.byCount, 2)}%</bdi> <span className="text-xs font-normal text-muted-foreground">(<bdi dir="ltr">{formatNumber(data.winRate.won)}/{formatNumber(data.winRate.decided)}</bdi> {t.decided})</span></span>}
        </div>
      </div> : null}
      {data?.lostTo.length ? <p className="text-sm">{t.lostTo}: {data.lostTo.map(entry => <span key={entry.competitorId} className="me-3"><bdi>{entry.competitorName ?? "—"}</bdi> (<bdi dir="ltr">{formatNumber(entry.count)}</bdi>)</span>)}</p> : null}
    </CardContent>
  </Card>;
}

function Goals({ tenantId, t, language }: { tenantId: string; t: Text; language: Language }) {
  const goals = trpc.strategy.goals.useQuery({ tenantId });
  const initiatives = trpc.strategy.initiatives.useQuery({ tenantId });
  const initiative = (item: NonNullable<typeof initiatives.data>[number]) => <li key={item.id} data-strategy-initiative={item.code} className="flex flex-wrap items-center gap-2 text-sm">
    <bdi>{item.code}</bdi><span>· {item.name}</span><Chip>{enumLabel(item.status, language)}</Chip>{item.dueAt ? <span className="text-xs text-muted-foreground">{t.due}: <bdi>{formatDate(item.dueAt, language)}</bdi></span> : null}
  </li>;
  const unlinked = initiatives.data?.filter(item => !item.goalId) ?? [];
  return <Card data-strategy-section="goals">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t.goals}</CardTitle></CardHeader>
    <CardContent className="grid gap-2">
      <SourceNotice query={goals} isArabic={language === "ar"} title={t.goals} />
      <SourceNotice query={initiatives} isArabic={language === "ar"} title={t.initiatives} />
      {goals.data && !goals.data.length ? <Empty name="goals">{t.noGoals}</Empty> : null}
      {goals.data?.map(goal => {
        const own = initiatives.data?.filter(item => item.goalId === goal.id) ?? [];
        return <div key={goal.id} data-strategy-goal={goal.code} className="grid gap-1 rounded-[var(--radius-md)] border border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><bdi>{goal.code}</bdi><span>· {goal.name}</span><Chip>{enumLabel(goal.status, language)}</Chip></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>{t.target} <strong><Value value={goal.targetValue} unit={goal.unit} t={t} /></strong></span><span className="text-muted-foreground">{t.period}: <bdi>{formatDate(goal.periodStart, language)}</bdi> – <bdi>{formatDate(goal.periodEnd, language)}</bdi></span></div>
          {own.length ? <ul className="grid gap-1 border-s-2 border-border ps-3">{own.map(initiative)}</ul> : <span className="text-xs text-muted-foreground">{t.noInitiatives}</span>}
        </div>;
      })}
      {unlinked.length ? <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t.unlinked}</span><ul className="grid gap-1">{unlinked.map(initiative)}</ul></div> : null}
    </CardContent>
  </Card>;
}

function Variances({ tenantId, t, language }: { tenantId: string; t: Text; language: Language }) {
  const variances = trpc.strategy.variances.useQuery({ tenantId });
  const assumptions = trpc.strategy.assumptions.useQuery({ tenantId });
  const nameOf = (id: string) => assumptions.data?.find(item => item.id === id);
  return <Card data-strategy-section="variances">
    <CardHeader className="pb-3"><CardTitle className="text-base">{t.variances}</CardTitle></CardHeader>
    <CardContent className="grid gap-2">
      <SourceNotice query={variances} isArabic={language === "ar"} title={t.variances} />
      <SourceNotice query={assumptions} isArabic={language === "ar"} title={t.assumptions} />
      {variances.data && !variances.data.length ? <Empty name="variances">{t.noVariances}</Empty> : null}
      {variances.data?.map(item => {
        const assumption = nameOf(item.assumptionId);
        const unit: Unit = assumption?.unit ?? "count";
        return <div key={item.id} data-strategy-variance={item.id} className="grid gap-1 rounded-[var(--radius-md)] border border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><bdi>{assumption ? `${assumption.code} · ${assumption.name}` : "—"}</bdi><Chip>{item.decision ? enumLabel(item.decision, language) : t.undecided}</Chip>{item.recurring ? <Chip>{t.recurring}</Chip> : null}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{t.assumed} <Value value={item.assumedValue} unit={unit} t={t} /></span>
            <span>{t.actual} <strong><Value value={item.actualValue} unit={unit} t={t} /></strong></span>
            <span className={item.difference < 0 ? "text-danger-soft-foreground" : undefined}>{t.difference} <bdi dir="ltr">{item.difference > 0 ? "+" : ""}{formatNumber(item.difference, 2)}{item.percentOfAssumed !== null ? ` (${item.percentOfAssumed > 0 ? "+" : ""}${formatNumber(item.percentOfAssumed, 2)}%)` : ""}</bdi></span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t.period}: <bdi>{formatDate(item.periodStart, language)}</bdi> – <bdi>{formatDate(item.periodEnd, language)}</bdi></span>
            <span>{t.sample}: <bdi dir="ltr">{formatNumber(item.sampleSize)}</bdi></span>
            <span>{t.source}: {item.actualSource === "pipeline" ? t.pipelineSource : t.manualSource}</span>
          </div>
        </div>;
      })}
    </CardContent>
  </Card>;
}

/**
 * Q-21 (b), batch 1: «مركز التخطيط الاستراتيجي» — read-only, company-wide. Every section reads its own strategy.* procedure (strategy.read at company
 * scope on the server; a viewer without it gets the server's refusal in each section's notice, never a figure). Nothing is computed here: the win rate,
 * the weighted value and each variance's difference come from the server as they are.
 */
export default function Strategy() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, TEXT);
  return <PageMain className="mx-auto grid w-full max-w-6xl gap-5 p-4 md:p-8">
    <header className="grid gap-1">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-sm text-muted-foreground">{t.intro}</p>
    </header>
    <Assumptions tenantId={tenantId} t={t} language={language} />
    <Pipeline tenantId={tenantId} t={t} language={language} />
    <Goals tenantId={tenantId} t={t} language={language} />
    <Variances tenantId={tenantId} t={t} language={language} />
  </PageMain>;
}
