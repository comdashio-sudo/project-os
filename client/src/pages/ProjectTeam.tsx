import React from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput, formatDate } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SectionErrorBoundary, SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

// Q-12 (c): the project's team — the people on this project with their roles, the invitations still waiting, and one form to invite someone onto THIS project with a role.
// The company is the one chosen in the top bar and the project is this page's, so the invitation is always «company → project → role». The server decides everything:
// listing the team takes project.manage or project.team.invite; inviting is tenant.createInvitation with scope «project» — by the company manager, or by whoever holds
// project.team.invite on this project (the planning engineer, the project manager) with a role the server allows — and it e-mails the invitation (#277).
const text = {
  ar: { title: "فريق المشروع", intro: "من يعمل على هذا المشروع وبأي دور. الدعوة من هنا تكون لهذا المشروع داخل الشركة الحالية.", members: "الأعضاء", none: "لا أحد على المشروع بعد.", company: "على الشركة كلها", invited: "دعوة لم تُقبل", pending: "دعوات بانتظار القبول", until: "حتى", invite: "دعوة إلى هذا المشروع", email: "البريد", role: "الدور", pick: "اختر دورًا", send: "إرسال الدعوة", sending: "جارٍ الإرسال…", emailed: "أُرسلت الدعوة إلى البريد.", copy: "لم يُرسل البريد؛ أرسل هذا الرابط بنفسك:" },
  en: { title: "Project team", intro: "Who works on this project, and as what. An invitation from here is for this project inside the current company.", members: "Members", none: "Nobody is on the project yet.", company: "company-wide", invited: "invitation not accepted", pending: "Invitations waiting", until: "until", invite: "Invite to this project", email: "E-mail", role: "Role", pick: "Choose a role", send: "Send the invitation", sending: "Sending…", emailed: "The invitation was e-mailed.", copy: "No e-mail was sent; send this link yourself:" },
  ur: { title: "پروجیکٹ ٹیم", intro: "اس پروجیکٹ پر کون کس کردار میں کام کرتا ہے۔ یہاں سے دعوت موجودہ کمپنی میں اسی پروجیکٹ کے لیے ہوتی ہے۔", members: "اراکین", none: "ابھی کوئی پروجیکٹ پر نہیں۔", company: "پوری کمپنی پر", invited: "دعوت قبول نہیں ہوئی", pending: "زیر التوا دعوتیں", until: "تک", invite: "اس پروجیکٹ میں مدعو کریں", email: "ای میل", role: "کردار", pick: "کردار منتخب کریں", send: "دعوت بھیجیں", sending: "بھیجی جا رہی ہے…", emailed: "دعوت ای میل کر دی گئی۔", copy: "ای میل نہیں بھیجی گئی؛ یہ لنک خود بھیجیں:" },
};

export function InviteForm({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const admin = trpc.projects.team.invitableRoles.useQuery({ tenantId, projectId });
  const [email, setEmail] = React.useState(""); const [roleId, setRoleId] = React.useState("");
  const invite = trpc.tenant.createInvitation.useMutation({ onSuccess: () => { setEmail(""); void utils.projects.team.invitations.invalidate(); } });
  const roles = (admin.data ?? []).map(role => ({ value: role.id, label: role.name }));
  const result = invite.data;
  return (
    <Card>
      <CardHeader><CardTitle>{t.invite}</CardTitle></CardHeader>
      <CardBody>
        <SourceNotice query={admin} isArabic={language === "ar"} title={t.role} />
        <CheckedForm className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={event => { event.preventDefault(); invite.mutate({ tenantId, email, roleId, scopeType: "project", scopeId: projectId }); }}>
          <Field label={t.email} required>{props => <TextInput {...props} className="md:min-h-11" type="email" dir="ltr" required value={email} onChange={event => setEmail(event.target.value)} />}</Field>
          <Field label={t.role} required>{props => <Select {...props} className="md:min-h-11" placeholder={t.pick} options={roles} value={roleId || undefined} onValueChange={setRoleId} />}</Field>
          <Button type="submit" className="min-h-11 md:min-h-11" loading={invite.isPending} disabled={!roleId}>{invite.isPending ? t.sending : t.send}</Button>
        </CheckedForm>
        {invite.error ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{getLocalizedProjectError(invite.error, language)}</p> : null}
        {result ? (result.emailed ? <p role="status" className="mt-2 text-sm text-success">{t.emailed}</p> : <div role="status" className="mt-2 text-sm"><p>{t.copy}</p><code dir="ltr" className="mt-1 block break-all rounded bg-muted p-2 text-xs">{`${window.location.origin}/invite/accept?token=${result.inviteToken}`}</code></div>) : null}
      </CardBody>
    </Card>
  );
}

export default function ProjectTeam() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isRtl } = useLanguage(); const t = pickLanguage(language, text);
  const team = trpc.projects.team.list.useQuery({ tenantId, projectId });
  const invitations = trpc.projects.team.invitations.useQuery({ tenantId, projectId });
  const isArabic = language === "ar";
  return (
    <PageMain className="py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
        <Card>
          <CardHeader><CardTitle>{t.members}</CardTitle></CardHeader>
          <CardBody>
            <SourceNotice query={team} isArabic={isArabic} title={t.members} />
            {team.isSuccess && !team.data.length ? <p className="text-sm text-muted-foreground">{t.none}</p> : null}
            <ul className="divide-y divide-border" data-testid="team-members">
              {(team.data ?? []).map(member => (
                <li key={member.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0"><p className="font-medium">{member.name ?? member.email}</p>{member.email ? <p dir="ltr" className="text-xs text-muted-foreground">{member.email}</p> : null}</div>
                  <div className="flex flex-wrap gap-1">{member.roles.map(role => <Badge key={`${role.roleId}-${role.scope}`} tone="neutral">{role.name}{role.scope === "company" ? ` · ${t.company}` : ""}</Badge>)}{member.status === "invited" ? <Badge tone="warning">{t.invited}</Badge> : null}</div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.pending}</CardTitle></CardHeader>
          <CardBody>
            <SourceNotice query={invitations} isArabic={isArabic} title={t.pending} />
            <ul className="divide-y divide-border" data-testid="team-invitations">
              {(invitations.data ?? []).map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span dir="ltr">{item.email}</span><span>{item.roleName} · {t.until} {formatDate(item.expiresAt, language)}</span></li>)}
            </ul>
          </CardBody>
        </Card>
        <WriteGate permission="project.team.invite" projectId={projectId}><SectionErrorBoundary title={t.invite} isArabic={isArabic}><InviteForm tenantId={tenantId} projectId={projectId} /></SectionErrorBoundary></WriteGate>
      </div>
    </PageMain>
  );
}
