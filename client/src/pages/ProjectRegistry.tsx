import { Button } from "@/components/ui/button";
import { formatAmount } from "@/components/ds/format";
import { OutsideShell, PageMain, PageHeader } from "@/components/pageFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { FieldError } from "@/components/FieldError";
import { formFieldErrors } from "@/lib/formValidation";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FolderKanban, Plus, Search, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { enumLabel } from "@/lib/labels";
import { useCan, WriteGate } from "@/lib/permissions";
import { EmptyState, ErrorState } from "@/components/ScreenStates";
import { pickLanguage } from "@/lib/language";

type LifecycleStage = "opportunity" | "pre_award" | "tender" | "award" | "mobilization" | "planning" | "design" | "procurement" | "execution" | "commissioning" | "handover" | "closeout" | "post_project_review";
type LifecycleFeedback = { projectId: string; status: "success" | "error"; error: unknown | null };

const lifecycleTransitions: Record<LifecycleStage, readonly LifecycleStage[]> = {
  opportunity: ["pre_award"],
  pre_award: ["tender", "award"],
  tender: ["award"],
  award: ["mobilization"],
  mobilization: ["planning"],
  planning: ["design", "procurement", "execution"],
  design: ["procurement", "execution"],
  procurement: ["execution"],
  execution: ["commissioning"],
  commissioning: ["handover"],
  handover: ["closeout"],
  closeout: ["post_project_review"],
  post_project_review: [],
};

export function lifecycleFeedbackTargetsProject(feedbackProjectId: string | undefined, projectId: string) {
  return feedbackProjectId === projectId;
}

/** The registry's figures come as decimal strings ("380000000.00"); a person reads 380,000,000. */
const money = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? "—" : formatAmount(Number(value), 2));

export default function ProjectRegistry() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const canCreate = useCan("project.write");
  const projects = trpc.projects.list.useQuery({ tenantId });
  const [form, setForm] = useState({ code: "", name: "", projectType: pickLanguage(language, { ar: "بنية تحتية", en: "Infrastructure", ur: "بنیادی ڈھانچہ" }), currency: "SAR" });
  const [nextStages, setNextStages] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<LifecycleFeedback | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createProject = trpc.projects.create.useMutation({ onSuccess: () => projects.refetch() });
  const transition = trpc.projects.transitionLifecycle.useMutation({
    onSuccess: (_result, input) => {
      setFeedback({ projectId: input.projectId, status: "success", error: null });
      projects.refetch();
    },
    onError: (error, input) => setFeedback({ projectId: input.projectId, status: "error", error }),
  });
  const t = pickLanguage(language, { ar: {
        workspace: "مساحة العمل", level: "المستوى 3 · سجل المشاريع", tag: "تسليم المشاريع", title: "سجل المشاريع", intro: "ابحث أو انتقل مباشرة إلى المشروع الذي تحتاجه ضمن حدود الشركة المحددة.", loading: "جارٍ تحميل المشاريع…", none: "لم يتم إنشاء مشاريع لهذه الشركة.", search: "ابحث بالرمز أو الاسم أو النوع", searchResults: "مشروع مطابق", noSearchResults: "لا توجد مشاريع مطابقة للبحث.", clearSearch: "مسح البحث", budget: "الميزانية", actual: "الفعلي", forecast: "التوقع", open: "فتح مركز قيادة المشروع", create: "إنشاء مشروع", code: "رمز المشروع", name: "اسم المشروع", type: "نوع المشروع", currency: "العملة", creating: "جارٍ إنشاء المشروع…", lifecycle: "دورة الحياة", chooseStage: "اختر المرحلة التالية", transition: "تحديث المرحلة", transitioning: "جارٍ التحديث…", transitioned: "تم تحديث مرحلة المشروع وتسجيل الدليل التدقيقي.",
      }, en: {
        workspace: "Workspace", level: "Level 3 · Project Registry", tag: "PROJECT DELIVERY", title: "Project registry", intro: "Search or go directly to the project you need inside the selected tenant boundary.", loading: "Loading projects…", none: "No projects have been created for this tenant.", search: "Search code, name, or type", searchResults: "matching projects", noSearchResults: "No projects match this search.", clearSearch: "Clear search", budget: "Budget", actual: "Actual", forecast: "Forecast", open: "Open project command center", create: "Create project", code: "Project code", name: "Project name", type: "Project type", currency: "Currency", creating: "Creating project…", lifecycle: "Lifecycle", chooseStage: "Choose next stage", transition: "Update stage", transitioning: "Updating…", transitioned: "The project stage was updated with audit evidence.",
      }, ur: {
        workspace: "Workspace", level: "Level 3 · Project Registry", tag: "PROJECT DELIVERY", title: "Project registry", intro: "Search or go directly to the project you need inside the selected tenant boundary.", loading: "Loading projects…", none: "No projects have been created for this tenant.", search: "Search code, name, or type", searchResults: "matching projects", noSearchResults: "No projects match this search.", clearSearch: "Clear search", budget: "Budget", actual: "Actual", forecast: "Forecast", open: "Open project command center", create: "Create project", code: "Project code", name: "Project name", type: "Project type", currency: "Currency", creating: "Creating project…", lifecycle: "Lifecycle", chooseStage: "Choose next stage", transition: "Update stage", transitioning: "Updating…", transitioned: "The project stage was updated with audit evidence.",
      } });
  const readDenied = Boolean(projects.error);
  const filteredProjects = useMemo(() => {
    const search = projectSearch.trim().toLocaleLowerCase();
    if (!search) return projects.data ?? [];
    return (projects.data ?? []).filter(project => `${project.code} ${project.name} ${project.projectType} ${project.lifecycleStage}`.toLocaleLowerCase().includes(search));
  }, [projectSearch, projects.data]);

  return (
    <PageMain className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <PageHeader className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <OutsideShell><Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.workspace}</Link></OutsideShell>
          <div className="flex items-center gap-3"><Link href={`/planner/${tenantId}`} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium text-primary">{pickLanguage(language, { ar: "حاسبة مدد التطوير", en: "Development planner", ur: "ترقی کا منصوبہ ساز" })}</Link><span className="text-sm text-slate-500">{t.level}</span><LanguageToggle /></div>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-6xl px-5 py-10">
        
        <div className="mb-8"><p className="text-xs font-bold tracking-[.16em] text-[#0e6b70]">{t.tag}</p><h1 className="mt-2 text-3xl font-semibold">{t.title}</h1><p className="mt-2 text-slate-600">{t.intro}</p></div>
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            {projects.isLoading ? <p className="text-slate-500">{t.loading}</p> : null}
            {projects.error ? <ErrorState isArabic={isArabic} error={projects.error} title={pickLanguage(language, { ar: "تعذّر تحميل سجل المشاريع", en: "The project registry could not be loaded", ur: "پروجیکٹس کا رجسٹر لوڈ نہیں ہو سکا" })} onRetry={() => projects.refetch()} retrying={projects.isFetching} /> : null}
            {!projects.isLoading && !projects.error && projects.data?.length ? (
              <><div className="mb-4 rounded-[var(--radius-md)] border border-border bg-card p-3 shadow-sm"><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={projectSearch} onChange={event => setProjectSearch(event.target.value)} aria-label={t.search} placeholder={t.search} className="ps-9 pe-10" />{projectSearch ? <Button type="button" size="icon" variant="ghost" className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label={t.clearSearch} title={t.clearSearch} onClick={() => setProjectSearch("")}><X className="h-4 w-4" /></Button> : null}</div><p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{filteredProjects.length} {t.searchResults}</p></div>{filteredProjects.length ? <div className="grid gap-4 md:grid-cols-2">
                {filteredProjects.map(project => (
                  <article key={project.id} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-start justify-between"><FolderKanban className="h-5 w-5 text-[#0e6b70]" /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{enumLabel(project.status, language)}</span></div>
                    <p className="mt-6 text-xs font-bold tracking-[.14em] text-slate-500">{project.code}</p><h2 className="mt-2 text-xl font-semibold">{project.name}</h2><p className="mt-1 text-sm text-slate-500">{project.projectType} · {enumLabel(project.lifecycleStage, language)}</p>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-xs"><div><p className="text-slate-500">{t.budget}</p><p className="mt-1 font-semibold">{money(project.currentBudget)}</p></div><div><p className="text-slate-500">{t.actual}</p><p className="mt-1 font-semibold">{money(project.actualCost)}</p></div><div><p className="text-slate-500">{t.forecast}</p><p className="mt-1 font-semibold">{money(project.forecastCost)}</p></div></div>
                    <WriteGate permission={"project.write"}><div className="mt-5 border-t pt-4"><Label htmlFor={`lifecycle-${project.id}`}>{t.lifecycle}</Label><div className="mt-1.5 flex gap-2"><select id={`lifecycle-${project.id}`} value={nextStages[project.id] ?? ""} onChange={event => setNextStages(current => ({ ...current, [project.id]: event.target.value }))} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">{t.chooseStage}</option>{lifecycleTransitions[project.lifecycleStage as LifecycleStage].map(stage => <option key={stage} value={stage}>{enumLabel(stage, language)}</option>)}</select><Button size="sm" disabled={!nextStages[project.id] || transition.isPending} onClick={() => { setFeedback(null); transition.mutate({ tenantId, projectId: project.id, lifecycleStage: nextStages[project.id] as LifecycleStage }); }}>{transition.isPending ? t.transitioning : t.transition}</Button></div>{lifecycleFeedbackTargetsProject(feedback?.projectId, project.id) && feedback?.status === "error" ? <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(feedback.error, isArabic)}</p> : null}{lifecycleFeedbackTargetsProject(feedback?.projectId, project.id) && feedback?.status === "success" ? <p role="status" className="mt-2 text-sm text-emerald-700">{t.transitioned}</p> : null}</div></WriteGate>
                    <Link href={`/projects/${tenantId}/${project.id}/controls`} className="mt-6 inline-flex text-sm font-semibold text-[#0e6b70] hover:underline">{t.open}<ArrowLeft className="ms-1 h-4 w-4" /></Link>
                  </article>
                ))}
              </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{t.noSearchResults}</div>}</>
            ) : null}
            {!projects.isLoading && !projects.error && !projects.data?.length ? <EmptyState isArabic={isArabic} title={t.none} body={canCreate ? (pickLanguage(language, { ar: "أنشئ المشروع الأول من النموذج المجاور.", en: "Create the first project from the form beside it.", ur: "ساتھ والے فارم سے پہلا پروجیکٹ بنائیں۔" })) : (pickLanguage(language, { ar: "ينشئ المشاريع من يملك صلاحية إنشائها.", en: "Someone with permission to create projects adds them.", ur: "پروجیکٹ بنانے کی اجازت رکھنے والا فرد انہیں شامل کرتا ہے۔" }))} action={canCreate ? { label: pickLanguage(language, { ar: "إلى نموذج المشروع الجديد", en: "Go to the new project form", ur: "نئے پروجیکٹ کے فارم پر جائیں" }), href: "#project-create" } : undefined} /> : null}
          </section>
          {!readDenied ? <WriteGate permission={"project.write"} reason={{ ar: "لا تملك صلاحية إنشاء المشاريع، فالشاشة للعرض فقط.", en: "You do not have permission to create projects; this view is read-only for you.", ur: "آپ کو پروجیکٹس بنانے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><form noValidate id="project-create" className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" onSubmit={event => { event.preventDefault(); const errors = formFieldErrors(event.currentTarget, language); setFieldErrors(errors); if (Object.keys(errors).length === 0) createProject.mutate({ tenantId, ...form }); }}><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#0e6b70]" /><h2 className="font-semibold">{t.create}</h2></div><div className="mt-5 space-y-4"><div><Label htmlFor="project-code">{t.code}</Label><Input id="project-code" dir="ltr" className="mt-1.5" value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} required /><FieldError id="project-code-error" message={fieldErrors["project-code"]} /></div><div><Label htmlFor="project-name">{t.name}</Label><Input id="project-name" className="mt-1.5" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required /><FieldError id="project-name-error" message={fieldErrors["project-name"]} /></div><div><Label htmlFor="project-type">{t.type}</Label><Input id="project-type" className="mt-1.5" value={form.projectType} onChange={event => setForm(current => ({ ...current, projectType: event.target.value }))} required /><FieldError id="project-type-error" message={fieldErrors["project-type"]} /></div><div><Label htmlFor="project-currency">{t.currency}</Label><Input id="project-currency" dir="ltr" className="mt-1.5" maxLength={3} value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} required /><FieldError id="project-currency-error" message={fieldErrors["project-currency"]} /></div>{createProject.error ? <p className="text-sm text-red-700">{getLocalizedProjectError(createProject.error, isArabic)}</p> : null}<Button className="w-full bg-[#123a4a] hover:bg-[#0d2e3b]" disabled={createProject.isPending}>{createProject.isPending ? t.creating : t.create}</Button></div></form></WriteGate> : null}
          <WriteGate permission={["project.create", "project.write"]}><Link href={`/projects/${tenantId}/new`} data-testid="project-setup-wizard" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />{pickLanguage(language, { ar: "مشروع جديد بالمعالج", en: "New project (wizard)", ur: "نیا پروجیکٹ (وزرڈ)" })}</Link></WriteGate>
        </div>
      </div>
    </PageMain>
  );
}
