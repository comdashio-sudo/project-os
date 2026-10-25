import React, { useState } from "react";
import { Link } from "wouter";
import { SourceNotice } from "@/components/SectionResilience";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput, notify } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// The platform owner creates companies (registration is by invitation: server assertMayCreateCompany); the company's administrator then invites the staff.
const dictionary = {
  ar: { title: "شركة جديدة", legal: "الاسم القانوني", slug: "المعرّف (حروف لاتينية صغيرة وأرقام وشرطات)", plan: "الخطة", seats: "المقاعد", create: "إنشاء الشركة", created: "أُنشئت الشركة", next: "ادعُ مدير الشركة من صفحة إدارتها:", openAdmin: "إدارة الشركة والدعوات", slugError: "المعرّف لا يقبل غير حروف لاتينية صغيرة وأرقام وشرطات.", choose: "اختر الخطة" },
  en: { title: "New company", legal: "Legal name", slug: "Identifier (lowercase letters, digits, dashes)", plan: "Plan", seats: "Seats", create: "Create the company", created: "Company created", next: "Invite the company's administrator from its administration page:", openAdmin: "Company administration and invitations", slugError: "The identifier takes only lowercase letters, digits and dashes.", choose: "Choose a plan" },
  ur: { title: "نئی کمپنی", legal: "قانونی نام", slug: "شناخت (چھوٹے لاطینی حروف، ہندسے، ڈیش)", plan: "پلان", seats: "نشستیں", create: "کمپنی بنائیں", created: "کمپنی بن گئی", next: "کمپنی کے منتظم کو اس کے انتظامی صفحے سے مدعو کریں:", openAdmin: "کمپنی کا انتظام اور دعوتیں", slugError: "شناخت میں صرف چھوٹے لاطینی حروف، ہندسے اور ڈیش چلتے ہیں۔", choose: "پلان منتخب کریں" },
};

export function NewCompanyCard({ onCreated }: { onCreated?: () => void }) {
  const { language, isArabic } = useLanguage(); const t = pickLanguage(language, dictionary);
  const plans = trpc.selfService.plans.useQuery();
  const [legalName, setLegalName] = useState(""); const [slug, setSlug] = useState(""); const [planCode, setPlanCode] = useState(""); const [seats, setSeats] = useState("5");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const slugOk = slug === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const signup = trpc.selfService.signup.useMutation({ onSuccess: result => { setCreatedId(result.tenantId); setLegalName(""); setSlug(""); notify.success(t.created); onCreated?.(); } });
  const ready = legalName.trim().length >= 2 && slug.length >= 3 && slugOk && planCode && Number(seats) >= 1;
  return (
    <Card aria-label={t.title}>
      <CardHeader><CardTitle>{t.title}</CardTitle></CardHeader>
      <CardBody className="grid gap-5 sm:grid-cols-2">
        <Field label={t.legal} required>{props => <TextInput {...props} value={legalName} onChange={event => setLegalName(event.target.value)} />}</Field>
        <Field label={t.slug} required error={slugOk ? undefined : t.slugError}>{props => <TextInput {...props} dir="ltr" invalid={!slugOk} value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} />}</Field>
        <Field label={t.plan} required>{props => <Select {...props} placeholder={t.choose} value={planCode || undefined} onValueChange={setPlanCode} options={(plans.data ?? []).map(plan => ({ value: plan.code, label: `${plan.name} · ${plan.packageCode}` }))} />}</Field>
        <Field label={t.seats} required>{props => <TextInput {...props} type="number" min={1} max={100000} value={seats} onChange={event => setSeats(event.target.value)} />}</Field>
        <div className="sm:col-span-2"><SourceNotice query={plans} isArabic={isArabic} title={t.plan} /></div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          {signup.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(signup.error, isArabic)}</p> : null}
          <div><Button loading={signup.isPending} disabled={!ready} onClick={() => signup.mutate({ legalName: legalName.trim(), slug, planCode, seats: Number(seats) })}>{t.create}</Button></div>
          {createdId ? <p role="status" className="text-sm text-muted-foreground">{t.next} <Link href={`/tenants/${createdId}/administration`} className="font-semibold text-primary">{t.openAdmin}</Link></p> : null}
        </div>
      </CardBody>
    </Card>
  );
}
