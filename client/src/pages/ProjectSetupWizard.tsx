import React from "react";
import { Link, useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, FileDropzone, Select, Stepper, TextInput } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { putToStorage } from "@/lib/uploadLimit";
import { InviteForm } from "./ProjectTeam";

// Q-12 (d): the planning engineer sets a new project up in three steps — its data and the three parties' logos, then the companies on it, then its team (the project
// manager included). Each step saves through the server's own procedures (projects.create, projects.profile.save, projects.companies.save, tenant.createInvitation),
// which hold the rules: project.create for the whole company, and the invitation rule. The project exists from the first step on, so leaving half-way loses nothing.
const PARTIES = ["client", "consultant", "contractor"] as const;
type Party = (typeof PARTIES)[number];
const text = {
  ar: { title: "مشروع جديد", intro: "أنشئ المشروع ثم أكمل بياناته وشركاته وفريقه. كل خطوة تُحفظ عند الانتقال.", steps: ["البيانات والشعارات", "الشركات", "الفريق"], code: "رمز المشروع", name: "اسم المشروع", type: "نوع المشروع", location: "الموقع", contract: "رقم العقد", client: "المالك", consultant: "الاستشاري", contractor: "المقاول", logo: "شعار", choose: "PNG أو JPG أو SVG، حتى 2 ميغابايت", next: "حفظ والتالي", back: "السابق", saving: "جارٍ الحفظ…", company: "اسم الشركة", role: "دورها", main: "المقاول الرئيسي", sub: "مقاول باطن", add: "إضافة", noCompanies: "لم تُضف شركات بعد.", finish: "إنهاء وفتح فريق المشروع", saved: "حُفظ المشروع", types: { villas: "فلل", townhouses: "تاون هاوس", buildings: "عمائر", infrastructure: "بنية تحتية", other: "أخرى" } },
  en: { title: "New project", intro: "Create the project, then complete its data, companies and team. Each step is saved as you move on.", steps: ["Data and logos", "Companies", "Team"], code: "Project code", name: "Project name", type: "Project type", location: "Location", contract: "Contract number", client: "Client", consultant: "Consultant", contractor: "Contractor", logo: "logo", choose: "PNG, JPG or SVG, up to 2 MB", next: "Save and continue", back: "Back", saving: "Saving…", company: "Company name", role: "Its role", main: "Main contractor", sub: "Subcontractor", add: "Add", noCompanies: "No companies added yet.", finish: "Finish and open the project team", saved: "Project saved", types: { villas: "Villas", townhouses: "Townhouses", buildings: "Buildings", infrastructure: "Infrastructure", other: "Other" } },
  ur: { title: "نیا پروجیکٹ", intro: "پروجیکٹ بنائیں، پھر اس کا ڈیٹا، کمپنیاں اور ٹیم مکمل کریں۔ ہر مرحلہ آگے بڑھنے پر محفوظ ہوتا ہے۔", steps: ["ڈیٹا اور لوگو", "کمپنیاں", "ٹیم"], code: "پروجیکٹ کوڈ", name: "پروجیکٹ کا نام", type: "پروجیکٹ کی قسم", location: "مقام", contract: "معاہدہ نمبر", client: "مالک", consultant: "کنسلٹنٹ", contractor: "ٹھیکیدار", logo: "لوگو", choose: "PNG، JPG یا SVG، زیادہ سے زیادہ 2 MB", next: "محفوظ کریں اور آگے", back: "پیچھے", saving: "محفوظ ہو رہا ہے…", company: "کمپنی کا نام", role: "اس کا کردار", main: "مرکزی ٹھیکیدار", sub: "ذیلی ٹھیکیدار", add: "شامل کریں", noCompanies: "ابھی کوئی کمپنی شامل نہیں۔", finish: "مکمل کریں اور پروجیکٹ ٹیم کھولیں", saved: "پروجیکٹ محفوظ ہو گیا", types: { villas: "ولاز", townhouses: "ٹاؤن ہاؤس", buildings: "عمارتیں", infrastructure: "انفراسٹرکچر", other: "دیگر" } },
};

function DataStep({ tenantId, projectId, onSaved }: { tenantId: string; projectId: string | null; onSaved: (projectId: string) => void }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const create = trpc.projects.create.useMutation();
  const save = trpc.projects.profile.save.useMutation();
  const uploadTarget = trpc.directUploads.create.useMutation();
  const [form, setForm] = React.useState({ code: "", name: "", projectType: "villas", location: "", contractNumber: "", clientName: "", consultantName: "", contractorName: "" });
  const [logos, setLogos] = React.useState<Partial<Record<Party, File>>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const id = projectId ?? (await create.mutateAsync({ tenantId, code: form.code, name: form.name, projectType: form.projectType, currency: "SAR" })).id;
      const changes: Partial<Record<Party, { uploadKey: string }>> = {};
      for (const party of PARTIES) {
        const file = logos[party]; if (!file) continue;
        const target = await uploadTarget.mutateAsync({ tenantId, projectId: id, purpose: "logo", fileName: file.name, contentType: file.type || "image/png" });
        await putToStorage(target.uploadUrl, target.headers, file, () => undefined);
        changes[party] = { uploadKey: target.uploadKey };
      }
      const text = (value: string) => value.trim() || null;
      await save.mutateAsync({ tenantId, projectId: id, location: text(form.location), contractNumber: text(form.contractNumber), clientName: text(form.clientName), consultantName: text(form.consultantName), contractorName: text(form.contractorName), workDays: [0, 1, 2, 3, 4], workStart: null, workEnd: null, reportPrefix: null, logos: changes });
      onSaved(id);
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  };
  return (
    <CheckedForm className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <Field label={t.code} required>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" required minLength={2} maxLength={80} disabled={Boolean(projectId)} value={form.code} onChange={set("code")} />}</Field>
      <Field label={t.name} required>{props => <TextInput {...props} className="md:min-h-11" required minLength={2} maxLength={255} disabled={Boolean(projectId)} value={form.name} onChange={set("name")} />}</Field>
      <Field label={t.type} required>{props => <Select {...props} className="md:min-h-11" disabled={Boolean(projectId)} options={Object.entries(t.types).map(([value, label]) => ({ value, label }))} value={form.projectType} onValueChange={value => setForm(current => ({ ...current, projectType: value }))} />}</Field>
      <Field label={t.location}>{props => <TextInput {...props} className="md:min-h-11" maxLength={255} value={form.location} onChange={set("location")} />}</Field>
      <Field label={t.contract}>{props => <TextInput {...props} className="md:min-h-11" dir="ltr" maxLength={80} value={form.contractNumber} onChange={set("contractNumber")} />}</Field>
      {PARTIES.map(party => (
        <div key={party} className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
          <Field label={t[party]}>{props => <TextInput {...props} className="md:min-h-11" maxLength={255} value={form[`${party}Name`]} onChange={set(`${party}Name`)} />}</Field>
          <div className="space-y-1"><p className="text-sm font-medium">{`${t.logo} ${t[party]}`}</p><FileDropzone accept={["image/png", "image/jpeg", "image/svg+xml"]} maxBytes={2 * 1024 * 1024} hint={t.choose} items={logos[party] ? [{ id: party, name: logos[party]!.name, size: logos[party]!.size, status: "queued" }] : []} onFiles={files => setLogos(current => ({ ...current, [party]: files[0] }))} onRemove={() => setLogos(current => ({ ...current, [party]: undefined }))} /></div>
        </div>
      ))}
      {error ? <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{getLocalizedProjectError(error as never, language)}</p> : null}
      <div className="sm:col-span-2"><Button type="submit" className="min-h-11 w-full sm:w-auto md:min-h-11" loading={busy}>{busy ? t.saving : t.next}</Button></div>
    </CheckedForm>
  );
}

function CompaniesStep({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const list = trpc.projects.companies.list.useQuery({ tenantId, projectId });
  const save = trpc.projects.companies.save.useMutation({ onSuccess: () => { setName(""); void utils.projects.companies.list.invalidate(); } });
  const [name, setName] = React.useState(""); const [role, setRole] = React.useState<"main" | "sub">("main");
  const active = (list.data ?? []).filter(company => company.active);
  return (
    <div className="space-y-3">
      {list.isError ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(list.error, language)}</p> : null}
      {list.isSuccess && !active.length ? <p className="text-sm text-muted-foreground">{t.noCompanies}</p> : null}
      <ul className="divide-y divide-border" data-testid="wizard-companies">{active.map(company => <li key={company.id} className="flex items-center justify-between gap-2 py-2"><span>{company.name}</span><Badge tone="neutral">{company.role === "main" ? t.main : t.sub}</Badge></li>)}</ul>
      <CheckedForm className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end" onSubmit={event => { event.preventDefault(); save.mutate({ tenantId, projectId, name, role }); }}>
        <Field label={t.company} required>{props => <TextInput {...props} className="md:min-h-11" required maxLength={255} value={name} onChange={event => setName(event.target.value)} />}</Field>
        <Field label={t.role} required>{props => <Select {...props} className="md:min-h-11" options={[{ value: "main", label: t.main }, { value: "sub", label: t.sub }]} value={role} onValueChange={value => setRole(value as "main" | "sub")} />}</Field>
        <Button type="submit" className="min-h-11 md:min-h-11" loading={save.isPending}>{t.add}</Button>
      </CheckedForm>
      {save.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(save.error, language)}</p> : null}
    </div>
  );
}

export default function ProjectSetupWizard() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { language, isRtl } = useLanguage(); const t = pickLanguage(language, text);
  const [step, setStep] = React.useState(0);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  return (
    <PageMain className="py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
        <Stepper label={t.title} current={step} steps={t.steps.map((label, index) => ({ id: String(index), label }))} onSelect={index => { if (projectId || index === 0) setStep(index); }} />
        <Card>
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{t.steps[step]}</CardTitle>{projectId ? <Badge tone="success">{t.saved}</Badge> : null}</div></CardHeader>
          <CardBody>
            {step === 0 ? <DataStep tenantId={tenantId} projectId={projectId} onSaved={id => { setProjectId(id); setStep(1); }} /> : null}
            {step === 1 && projectId ? <CompaniesStep tenantId={tenantId} projectId={projectId} /> : null}
            {step === 2 && projectId ? <InviteForm tenantId={tenantId} projectId={projectId} /> : null}
          </CardBody>
        </Card>
        <div className="flex flex-wrap justify-between gap-2">
          {step > 0 ? <Button variant="secondary" className="min-h-11 md:min-h-11" onClick={() => setStep(step - 1)}>{t.back}</Button> : <span />}
          {step === 1 ? <Button className="min-h-11 md:min-h-11" onClick={() => setStep(2)}>{t.next}</Button> : null}
          {step === 2 && projectId ? <Link href={`/projects/${tenantId}/${projectId}/team`} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">{t.finish}</Link> : null}
        </div>
      </div>
    </PageMain>
  );
}
