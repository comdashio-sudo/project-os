import { SectionErrorBoundary, SourceNotice } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { formFieldErrors, slugFieldError } from "@/lib/formValidation";
import { FieldError } from "@/components/FieldError";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { getOperationalRoleName, operationalRoleProfiles } from "@/lib/operationalRolePresentation";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ProjectImports } from "./ProjectImports";
import { pickLanguage, resolveLanguage } from "@/lib/language";
import { useOptionalLanguage } from "@/contexts/optionalLanguage";

type Step = "company" | "project" | "import" | "invite";
const STEPS: Step[] = ["company", "project", "import", "invite"];
const field = "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

const text = {
  ar: {
    back: "مساحة العمل", title: "معالج الإعداد لأول شركة", sub: "أربع خطوات: الشركة، ثم أول مشروع، ثم استيراد بياناته، ثم دعوة فريقك بأدوار جاهزة. كل خطوة تُحفظ فور إتمامها ويمكنك العودة إليها لاحقًا.",
    steps: { company: "الشركة", project: "أول مشروع", import: "الاستيراد", invite: "دعوة الفريق" },
    stepOf: (n: number) => `الخطوة ${n} من 4`, done: "تمت", next: "التالي", skip: "تخطَّ هذه الخطوة الآن", previous: "السابق",
    company: { head: "١. الشركة", have: "شركتك", legal: "الاسم القانوني", slug: "المعرّف (أحرف إنجليزية صغيرة وأرقام وشرطات)", plan: "الخطة", seats: "عدد المقاعد", create: "إنشاء الشركة", creating: "جارٍ الإنشاء…", loading: "جارٍ التحميل…", pick: "اختر خطة", choose: "اختر الشركة التي تُعدّها", created: "أُنشئت الشركة. انتقل إلى الخطوة التالية." },
    project: { head: "٢. أول مشروع", code: "رمز المشروع", name: "اسم المشروع", type: "نوع المشروع", currency: "العملة (3 أحرف)", create: "إنشاء المشروع", creating: "جارٍ الإنشاء…", exists: "مشاريع الشركة", use: "اعتمد هذا المشروع", chosen: "المشروع المعتمد", none: "لا مشروع بعد: أنشئ أول مشروع.", defaultType: "إنشاءات" },
    import: { head: "٣. استيراد بيانات المشروع", lead: "ارفع جدولك الزمني (Primavera XER أو Excel) أو قوالب البيانات (Excel/CSV). الملفات تُفحص وتُعرض لك قبل أن يُكتب منها شيء، ويمكنك تخطي الخطوة والعودة إليها من «استيراد البيانات» داخل المشروع.", needProject: "اختر المشروع في الخطوة السابقة أولًا." },
    invite: { head: "٤. دعوة الفريق بأدوار جاهزة", lead: "كل دور جاهز بصلاحيات محدودة وفصل مهام. الدعوة تُقيَّد افتراضيًا بالمشروع الأول فقط.", email: "بريد المدعو", role: "الدور", scope: "نطاق الدعوة", scopeProject: "المشروع الأول فقط", scopeCompany: "كل الشركة", send: "إنشاء الدعوة", sending: "جارٍ الإنشاء…", link: "رابط الدعوة — أرسله للمدعو (يظهر مرة واحدة)", purpose: "الغرض", focus: "التركيز", boundary: "الحدود", sent: "دعوات هذه الجلسة", noRoles: "لا أدوار متاحة.", pickRole: "اختر دورًا", finish: "إنهاء الإعداد والانتقال إلى المشروع", needProject: "اختر المشروع أولًا." },
  },
  en: {
    back: "Workspace", title: "First-company setup", sub: "Four steps: the company, the first project, importing its data, then inviting your team with ready-made roles. Each step is saved as soon as it is done and you can return to it later.",
    steps: { company: "Company", project: "First project", import: "Import", invite: "Invite team" },
    stepOf: (n: number) => `Step ${n} of 4`, done: "Done", next: "Next", skip: "Skip this step for now", previous: "Previous",
    company: { head: "1. Company", have: "Your company", legal: "Legal name", slug: "Identifier (lowercase letters, digits, dashes)", plan: "Plan", seats: "Seats", create: "Create the company", creating: "Creating…", loading: "Loading…", pick: "Choose a plan", choose: "Choose the company you are setting up", created: "The company was created. Go to the next step." },
    project: { head: "2. First project", code: "Project code", name: "Project name", type: "Project type", currency: "Currency (3 letters)", create: "Create the project", creating: "Creating…", exists: "Company projects", use: "Use this project", chosen: "Chosen project", none: "No project yet: create the first one.", defaultType: "Construction" },
    import: { head: "3. Import the project data", lead: "Upload your schedule (Primavera XER or Excel) or the data templates (Excel/CSV). Files are checked and shown to you before anything is written, and you can skip the step and come back to it from “Data import” inside the project.", needProject: "Choose the project in the previous step first." },
    invite: { head: "4. Invite the team with ready-made roles", lead: "Each role is ready with limited permissions and separation of duties. The invitation is limited to the first project by default.", email: "Invitee e-mail", role: "Role", scope: "Invitation scope", scopeProject: "First project only", scopeCompany: "Whole company", send: "Create the invitation", sending: "Creating…", link: "Invitation link — send it to the invitee (shown once)", purpose: "Purpose", focus: "Focus", boundary: "Boundary", sent: "Invitations from this session", noRoles: "No roles available.", pickRole: "Choose a role", finish: "Finish setup and go to the project", needProject: "Choose the project first." },
  }, ur: {
    back: "Workspace", title: "First-company setup", sub: "Four steps: the company, the first project, importing its data, then inviting your team with ready-made roles. Each step is saved as soon as it is done and you can return to it later.",
    steps: { company: "Company", project: "First project", import: "Import", invite: "Invite team" },
    stepOf: (n: number) => `Step ${n} of 4`, done: "Done", next: "Next", skip: "Skip this step for now", previous: "Previous",
    company: { head: "1. Company", have: "Your company", legal: "Legal name", slug: "Identifier (lowercase letters, digits, dashes)", plan: "Plan", seats: "Seats", create: "Create the company", creating: "Creating…", loading: "Loading…", pick: "Choose a plan", choose: "Choose the company you are setting up", created: "The company was created. Go to the next step." },
    project: { head: "2. First project", code: "Project code", name: "Project name", type: "Project type", currency: "Currency (3 letters)", create: "Create the project", creating: "Creating…", exists: "Company projects", use: "Use this project", chosen: "Chosen project", none: "No project yet: create the first one.", defaultType: "Construction" },
    import: { head: "3. Import the project data", lead: "Upload your schedule (Primavera XER or Excel) or the data templates (Excel/CSV). Files are checked and shown to you before anything is written, and you can skip the step and come back to it from “Data import” inside the project.", needProject: "Choose the project in the previous step first." },
    invite: { head: "4. Invite the team with ready-made roles", lead: "Each role is ready with limited permissions and separation of duties. The invitation is limited to the first project by default.", email: "Invitee e-mail", role: "Role", scope: "Invitation scope", scopeProject: "First project only", scopeCompany: "Whole company", send: "Create the invitation", sending: "Creating…", link: "Invitation link — send it to the invitee (shown once)", purpose: "Purpose", focus: "Focus", boundary: "Boundary", sent: "Invitations from this session", noRoles: "No roles available.", pickRole: "Choose a role", finish: "Finish setup and go to the project", needProject: "Choose the project first." },
  },
};

/** The setup wizard (item 11): company → first project → import → invite, composed only from procedures that already enforce their own permissions. */
export default function SetupWizard() {
  const { tenantId: routeTenantId } = useParams<{ tenantId?: string }>();
  const { isArabic, isRtl, language } = useLanguage();
  const t = pickLanguage(language, text);
  const [, navigate] = useLocation();
  const tenants = trpc.tenant.mine.useQuery();
  const tenantId = routeTenantId ?? "";
  const [step, setStep] = useState<Step>(() => (typeof window !== "undefined" && (STEPS as string[]).includes(window.location.hash.slice(1)) ? (window.location.hash.slice(1) as Step) : "company"));
  const [projectId, setProjectId] = useState("");
  const goto = (next: Step) => { setStep(next); try { window.history.replaceState(null, "", `#${next}`); } catch { /* the address bar is a convenience */ } };
  const projects = trpc.projects.list.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  useEffect(() => { if (!projectId && projects.data?.length === 1) setProjectId(projects.data[0]!.id); }, [projects.data, projectId]);
  const index = STEPS.indexOf(step);
  const project = projects.data?.find(item => item.id === projectId);
  const complete: Record<Step, boolean> = { company: Boolean(tenantId), project: Boolean(projectId), import: false, invite: false };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900" dir={isRtl ? "rtl" : "ltr"}>
      <header className="border-b bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4"><Link href="/" className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link></div></header>
      <div className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-3xl font-semibold">{t.title}</h1>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">{t.sub}</p>
        <nav aria-label={t.title} className="mt-6"><ol className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((key, i) => (
            <li key={key}><button type="button" aria-current={step === key ? "step" : undefined} disabled={i > 0 && !tenantId} onClick={() => goto(key)} className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${step === key ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "border-slate-300 bg-white text-slate-700 disabled:opacity-50"}`}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs">{complete[key] ? <Check className="h-4 w-4" aria-label={t.done} /> : i + 1}</span>{t.steps[key]}</button></li>
          ))}
        </ol></nav>
        <p className="mt-3 text-xs text-slate-600">{t.stepOf(index + 1)}</p>
        <SourceNotice query={tenants} isArabic={isArabic} title={pickLanguage(language, { ar: "قائمة شركاتك", en: "Your company list", ur: "آپ کی کمپنیوں کی فہرست" })} className="mt-4" />
        <SourceNotice query={projects} isArabic={isArabic} title={pickLanguage(language, { ar: "قائمة مشاريع الشركة", en: "The company's project list", ur: "کمپنی کے پروجیکٹس کی فہرست" })} className="mt-4" />
        <section className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <SectionErrorBoundary key={step} title={t.steps[step]} isArabic={isArabic}>
            {step === "company" && <CompanyStep t={t.company} isArabic={isArabic} tenantId={tenantId} tenants={tenants.data ?? []} onDone={id => { navigate(`/setup/${id}#project`); setStep("project"); }} />}
            {step === "project" && (tenantId ? <ProjectStep t={t.project} isArabic={isArabic} tenantId={tenantId} projects={projects.data ?? []} chosen={projectId} onChoose={setProjectId} refetch={() => projects.refetch()} /> : <p>{t.company.choose}</p>)}
            {step === "import" && <div><h2 className="text-xl font-semibold">{t.import.head}</h2><p className="mt-2 leading-7 text-slate-600">{t.import.lead}</p>{projectId ? <div className="mt-4"><ProjectImports tenantId={tenantId} projectId={projectId} /></div> : <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.import.needProject}</p>}</div>}
            {step === "invite" && <InviteStep t={t.invite} isArabic={isArabic} tenantId={tenantId} projectId={projectId} project={project} />}
          </SectionErrorBoundary>
        </section>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="outline" className="min-h-[44px]" disabled={index === 0} onClick={() => goto(STEPS[index - 1]!)}>{t.previous}</Button>
          <div className="flex gap-2">
            {(step === "import") && <Button variant="ghost" className="min-h-[44px]" onClick={() => goto("invite")}>{t.skip}</Button>}
            {index < STEPS.length - 1 && <Button className="min-h-[44px]" disabled={(step === "company" || step === "project") && !complete[step]} onClick={() => goto(STEPS[index + 1]!)}>{t.next}</Button>}
          </div>
        </div>
      </div>
    </main>
  );
}

function CompanyStep({ t, isArabic, tenantId, tenants, onDone }: { t: (typeof text)["ar"]["company"]; isArabic: boolean; tenantId: string; tenants: Array<{ tenantId: string; legalName?: string | null; name?: string | null }>; onDone: (tenantId: string) => void }) {
  const { language } = useLanguage();
  const plans = trpc.selfService.plans.useQuery();
  const utils = trpc.useUtils();
  const [legalName, setLegalName] = useState(""); const [slug, setSlug] = useState(""); const [planCode, setPlanCode] = useState(""); const [seats, setSeats] = useState("5");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const signup = trpc.selfService.signup.useMutation({ onSuccess: async result => { await utils.tenant.mine.invalidate(); onDone(result.tenantId); } });
  const current = tenants.find(item => item.tenantId === tenantId);
  return (
    <div>
      <h2 className="text-xl font-semibold">{t.head}</h2>
      <SourceNotice query={plans} isArabic={isArabic} title={pickLanguage(language, { ar: "قائمة الخطط", en: "The plan list", ur: "پلانز کی فہرست" })} className="mt-3" />
      {tenants.length > 0 && <div className="mt-4"><Label htmlFor="setup-company">{current ? t.have : t.choose}</Label>
        <select id="setup-company" className={`${field} mt-1`} value={tenantId} onChange={event => { if (event.target.value) onDone(event.target.value); }}><option value="">—</option>{tenants.map(item => <option key={item.tenantId} value={item.tenantId}>{item.legalName ?? item.name ?? item.tenantId}</option>)}</select></div>}
      {tenantId && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{t.created}</p>}
      {!tenants.length && (
        <form noValidate className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const errors = formFieldErrors(event.currentTarget, language); const slugProblem = slugFieldError(slug, language); if (slugProblem) errors["setup-slug"] = slugProblem; setFieldErrors(errors); if (Object.keys(errors).length === 0) signup.mutate({ legalName, slug, planCode, seats: Number(seats) }); }}>
          <div><Label htmlFor="setup-legal">{t.legal}</Label><Input id="setup-legal" className="mt-1" value={legalName} onChange={event => setLegalName(event.target.value)} required minLength={2} /><FieldError id="setup-legal-error" message={fieldErrors["setup-legal"]} /></div>
          <div><Label htmlFor="setup-slug">{t.slug}</Label><Input id="setup-slug" dir="ltr" className="mt-1" aria-describedby="setup-slug-error" aria-invalid={slug !== "" && !!slugFieldError(slug, language)} value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} required /><FieldError id="setup-slug-error" message={fieldErrors["setup-slug"] ?? (slug !== "" ? slugFieldError(slug, language) : null)} /></div>
          <div><Label htmlFor="setup-plan">{t.plan}</Label><select id="setup-plan" className={`${field} mt-1`} value={planCode} onChange={event => setPlanCode(event.target.value)} disabled={plans.isLoading} required><option value="">{plans.isLoading ? t.loading : t.pick}</option>{plans.data?.map(plan => <option key={plan.code} value={plan.code}>{plan.name} · {plan.packageCode}</option>)}</select><FieldError id="setup-plan-error" message={fieldErrors["setup-plan"]} /></div>
          <div><Label htmlFor="setup-seats">{t.seats}</Label><Input id="setup-seats" type="number" min={1} max={100000} className="mt-1" value={seats} onChange={event => setSeats(event.target.value)} required /><FieldError id="setup-seats-error" message={fieldErrors["setup-seats"]} /></div>
          {signup.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(signup.error, isArabic)}</p>}
          <div className="sm:col-span-2"><Button className="min-h-[44px]" disabled={signup.isPending || !planCode}>{signup.isPending ? t.creating : t.create}</Button></div>
        </form>
      )}
    </div>
  );
}

function ProjectStep({ t, isArabic, tenantId, projects, chosen, onChoose, refetch }: { t: (typeof text)["ar"]["project"]; isArabic: boolean; tenantId: string; projects: Array<{ id: string; code: string; name: string }>; chosen: string; onChoose: (id: string) => void; refetch: () => void }) {
  const { language } = useLanguage();
  const [form, setForm] = useState({ code: "", name: "", projectType: t.defaultType, currency: "SAR" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const create = trpc.projects.create.useMutation({ onSuccess: async result => { await refetch(); const id = (result as { id?: string; projectId?: string } | undefined)?.id ?? (result as { projectId?: string } | undefined)?.projectId; if (id) onChoose(id); setForm({ ...form, code: "", name: "" }); } });
  return (
    <div>
      <h2 className="text-xl font-semibold">{t.head}</h2>
      {projects.length > 0 ? <div className="mt-4"><p className="text-sm font-semibold">{t.exists}</p><ul className="mt-2 space-y-2">{projects.map(project => <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"><span><span dir="ltr" className="font-mono text-xs text-slate-500">{project.code}</span> {project.name}</span>{chosen === project.id ? <span className="text-sm font-semibold text-emerald-700">✓ {t.chosen}</span> : <Button variant="outline" className="min-h-[44px]" onClick={() => onChoose(project.id)}>{t.use}</Button>}</li>)}</ul></div> : <p className="mt-3 text-sm text-slate-600">{t.none}</p>}
      <WriteGate permission="project.write" reason={{ ar: "لا تملك صلاحية إنشاء المشاريع.", en: "You do not have permission to create projects.", ur: "آپ کو پروجیکٹ بنانے کی اجازت نہیں ہے۔" }}>
        <form noValidate className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const errors = formFieldErrors(event.currentTarget, language); setFieldErrors(errors); if (Object.keys(errors).length === 0) create.mutate({ tenantId, ...form }); }}>
          <div><Label htmlFor="setup-code">{t.code}</Label><Input id="setup-code" dir="ltr" className="mt-1" value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} required minLength={2} /><FieldError id="setup-code-error" message={fieldErrors["setup-code"]} /></div>
          <div><Label htmlFor="setup-name">{t.name}</Label><Input id="setup-name" className="mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required minLength={2} /><FieldError id="setup-name-error" message={fieldErrors["setup-name"]} /></div>
          <div><Label htmlFor="setup-type">{t.type}</Label><Input id="setup-type" className="mt-1" value={form.projectType} onChange={event => setForm({ ...form, projectType: event.target.value })} required minLength={2} /><FieldError id="setup-type-error" message={fieldErrors["setup-type"]} /></div>
          <div><Label htmlFor="setup-currency">{t.currency}</Label><Input id="setup-currency" dir="ltr" className="mt-1" maxLength={3} minLength={3} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /><FieldError id="setup-currency-error" message={fieldErrors["setup-currency"]} /></div>
          {create.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(create.error, isArabic)}</p>}
          <div className="sm:col-span-2"><Button className="min-h-[44px]" disabled={create.isPending}>{create.isPending ? t.creating : t.create}</Button></div>
        </form>
      </WriteGate>
    </div>
  );
}

function InviteStep({ t, isArabic, tenantId, projectId, project }: { t: (typeof text)["ar"]["invite"]; isArabic: boolean; tenantId: string; projectId: string; project?: { id: string; code: string; name: string } }) {
  const language = useOptionalLanguage() ?? resolveLanguage(isArabic);
  const admin = trpc.tenant.administration.useQuery({ tenantId }, { enabled: Boolean(tenantId) }); // opening it installs the ready-made system roles for the company
  const [email, setEmail] = useState(""); const [roleId, setRoleId] = useState(""); const [scopeChoice, setScopeChoice] = useState<"project" | "company" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const scope = scopeChoice ?? (projectId ? "project" : "company"); // follows the chosen project until the person picks a scope on purpose
  const [sent, setSent] = useState<Array<{ email: string; role: string; token: string }>>([]);
  const roles = useMemo(() => (admin.data?.roles ?? []).filter(role => role.code !== "TENANT_OWNER"), [admin.data]);
  const role = roles.find(item => item.id === roleId);
  const profile = role ? operationalRoleProfiles[role.code as keyof typeof operationalRoleProfiles] : undefined;
  const invite = trpc.tenant.createInvitation.useMutation({ onSuccess: result => { setSent(list => [{ email, role: role ? getOperationalRoleName(role, isArabic) : "", token: result.inviteToken }, ...list]); setEmail(""); } });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div>
      <h2 className="text-xl font-semibold">{t.head}</h2>
      <p className="mt-2 leading-7 text-slate-600">{t.lead}</p>
      {admin.error ? <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(admin.error, isArabic)}</p> : null}
      {!roles.length && !admin.isLoading && !admin.error ? <p className="mt-3 text-sm text-slate-600">{t.noRoles}</p> : null}
      <WriteGate permission="tenant.manage" reason={{ ar: "لا تملك صلاحية إدارة الشركة، فلا تُرسل دعوات.", en: "You do not have permission to manage the company, so you cannot invite.", ur: "آپ کو کمپنی کا انتظام کرنے کی اجازت نہیں ہے، اس لیے آپ دعوت نہیں دے سکتے۔" }}>
        <form noValidate className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const errors = formFieldErrors(event.currentTarget, language); setFieldErrors(errors); if (Object.keys(errors).length === 0) invite.mutate({ tenantId, email, roleId, scopeType: scope, scopeId: scope === "project" ? projectId : undefined }); }}>
          <div><Label htmlFor="setup-email">{t.email}</Label><Input id="setup-email" type="email" dir="ltr" className="mt-1" value={email} onChange={event => setEmail(event.target.value)} required /><FieldError id="setup-email-error" message={fieldErrors["setup-email"]} /></div>
          <div><Label htmlFor="setup-role">{t.role}</Label><select id="setup-role" className={`${field} mt-1`} value={roleId} onChange={event => setRoleId(event.target.value)} required><option value="">{t.pickRole}</option>{roles.map(item => <option key={item.id} value={item.id}>{getOperationalRoleName(item, isArabic)}</option>)}</select><FieldError id="setup-role-error" message={fieldErrors["setup-role"]} /></div>
          <div><Label htmlFor="setup-scope">{t.scope}</Label><select id="setup-scope" className={`${field} mt-1`} value={scope} onChange={event => setScopeChoice(event.target.value as "project" | "company")}><option value="project" disabled={!projectId}>{t.scopeProject}{project ? ` — ${project.name}` : ""}</option><option value="company">{t.scopeCompany}</option></select></div>
          {profile && <dl className="rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><dt className="font-semibold">{t.purpose}</dt><dd>{profile[language].purpose}</dd><dt className="mt-2 font-semibold">{t.focus}</dt><dd>{profile[language].focus}</dd><dt className="mt-2 font-semibold">{t.boundary}</dt><dd>{profile[language].boundary}</dd></dl>}
          {invite.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{getLocalizedProjectError(invite.error, isArabic)}</p>}
          <div className="sm:col-span-2"><Button className="min-h-[44px]" disabled={invite.isPending || !roleId}>{invite.isPending ? t.sending : t.send}</Button></div>
        </form>
      </WriteGate>
      {sent.length > 0 && <div className="mt-5"><p className="text-sm font-semibold">{t.sent}</p><ul className="mt-2 space-y-2">{sent.map(item => <li key={item.token} className="rounded-xl border border-slate-200 p-3 text-sm"><p><span dir="ltr">{item.email}</span> · {item.role}</p><p className="mt-1 text-xs text-slate-500">{t.link}</p><code dir="ltr" className="mt-1 block break-all rounded bg-slate-100 p-2 text-xs">{`${origin}/invite/accept?token=${item.token}`}</code></li>)}</ul></div>}
      <div className="mt-6">{projectId ? <Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex min-h-[44px] items-center rounded-xl bg-[#0e6b70] px-4 text-sm font-semibold text-white">{t.finish}</Link> : <p className="text-sm text-slate-500">{t.needProject}</p>}</div>
    </div>
  );
}
