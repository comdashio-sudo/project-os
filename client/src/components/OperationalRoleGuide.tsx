import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { operationalRoleProfiles, getOperationalRoleName } from "@/lib/operationalRolePresentation";
import { ShieldCheck } from "lucide-react";
import React from "react";

type Role = { code: string; name: string; systemManaged: boolean; permissions: { code: string }[] };

export function OperationalRoleGuide({ roles, isArabic }: { roles: Role[]; isArabic: boolean }) {
  const profiles = roles
    .filter(role => role.systemManaged && role.code in operationalRoleProfiles)
    .map(role => ({ role, profile: operationalRoleProfiles[role.code as keyof typeof operationalRoleProfiles][isArabic ? "ar" : "en"] }));

  if (!profiles.length) return null;

  const text = isArabic
    ? { title: "دليل الأدوار الجاهزة", sub: "اختر الدور بحسب المسؤولية، ثم حدد نطاقه. الصلاحيات الحساسة وفصل الواجبات تحمي القرار من التداخل.", focus: "يركز على", boundary: "الحد الفاصل", permissions: "صلاحيات" }
    : { title: "Ready role guide", sub: "Choose the role by responsibility, then set its scope. Sensitive permissions and separation of duties protect decisions from overlap.", focus: "Focus", boundary: "Boundary", permissions: "Permissions" };

  return (
    <Card className="mt-6 border-[#b7e5dc] bg-[#f5fcfa]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#0e6b70]"><ShieldCheck className="h-5 w-5" />{text.title}</CardTitle>
        <p className="text-sm leading-6 text-slate-600">{text.sub}</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {profiles.map(({ role, profile }) => (
          <article key={role.code} className="rounded-xl border border-[#ccece5] bg-white p-4">
            <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-900">{getOperationalRoleName(role, isArabic)}</h2><Badge variant="secondary">{role.permissions.length}</Badge></div>
            <p className="mt-2 text-sm font-medium text-[#0e6b70]">{profile.purpose}</p>
            <p className="mt-3 text-xs font-semibold text-slate-500">{text.focus}</p><p className="mt-1 text-sm text-slate-700">{profile.focus}</p>
            <p className="mt-3 text-xs font-semibold text-slate-500">{text.boundary}</p><p className="mt-1 text-sm text-slate-700">{profile.boundary}</p>
            <p className="mt-3 text-xs text-slate-500">{text.permissions}: {role.permissions.length}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
