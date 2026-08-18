import { LanguageToggle } from "@/components/LanguageToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, KeyRound, Search, ShieldCheck, ShieldPlus, UserCheck, UserPlus, Users } from "lucide-react";
import React from "react";
import { Link, useParams } from "wouter";

type ScopeType = "company" | "portfolio" | "program" | "project";

export default function TenantAdministration() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const utils = trpc.useUtils();
  const [lookupEmailInput, setLookupEmailInput] = React.useState("");
  const [lookupEmail, setLookupEmail] = React.useState("");
  const [targetUserId, setTargetUserId] = React.useState<number | null>(null);
  const [roleId, setRoleId] = React.useState("");
  const [scopeType, setScopeType] = React.useState<ScopeType>("company");
  const [scopeId, setScopeId] = React.useState("");
  const [newRoleCode, setNewRoleCode] = React.useState("");
  const [newRoleName, setNewRoleName] = React.useState("");
  const [newRoleProduct, setNewRoleProduct] = React.useState<"EXECUTIVE" | "PMO" | "PROJECT">("EXECUTIVE");
  const [newRolePermissions, setNewRolePermissions] = React.useState<string[]>([]);
  const [existingMembershipId, setExistingMembershipId] = React.useState("");
  const [existingMembershipRoleId, setExistingMembershipRoleId] = React.useState("");
  const [existingMembershipScopeType, setExistingMembershipScopeType] = React.useState<ScopeType>("company");
  const [existingMembershipScopeId, setExistingMembershipScopeId] = React.useState("");
  const [revokingAssignmentId, setRevokingAssignmentId] = React.useState<string | null>(null);
  const query = trpc.tenant.administration.useQuery({ tenantId });
  const assignableUser = trpc.tenant.findAssignableUser.useQuery({ tenantId, email: lookupEmail }, { enabled: Boolean(lookupEmail) });
  const assignment = trpc.tenant.assignMember.useMutation({
    onSuccess: async () => {
      await utils.tenant.administration.invalidate({ tenantId });
      setLookupEmailInput("");
      setLookupEmail("");
      setTargetUserId(null);
      setRoleId("");
      setScopeType("company");
      setScopeId("");
    },
  });
  const roleCreation = trpc.tenant.createRole.useMutation({
    onSuccess: async () => {
      await utils.tenant.administration.invalidate({ tenantId });
      setNewRoleCode("");
      setNewRoleName("");
      setNewRoleProduct("EXECUTIVE");
      setNewRolePermissions([]);
    },
  });
  const existingRoleAssignment = trpc.tenant.assignMembershipRole.useMutation({
    onSuccess: async () => {
      await utils.tenant.administration.invalidate({ tenantId });
      setExistingMembershipId("");
      setExistingMembershipRoleId("");
      setExistingMembershipScopeType("company");
      setExistingMembershipScopeId("");
    },
  });
  const roleRevocation = trpc.tenant.revokeMembershipRole.useMutation({
    onSuccess: async () => {
      await utils.tenant.administration.invalidate({ tenantId });
      setRevokingAssignmentId(null);
    },
  });
  const t = isArabic
    ? {
        back: "مساحة العمل", level: "الإدارة التنفيذية", title: "أعضاء وأدوار المؤسسة", sub: "عرض محمي للعضويات والأدوار ونطاقات الوصول ضمن المؤسسة المصرح بها.", loading: "جارٍ تحميل إدارة المؤسسة…", members: "الأعضاء", roles: "الأدوار", permissions: "كتالوج الصلاحيات", noMembers: "لا توجد عضويات ظاهرة ضمن هذه المؤسسة.", noRoles: "لا توجد أدوار مخصصة ضمن هذه المؤسسة.", noPermissions: "لا توجد صلاحيات في الكتالوج.", scope: "النطاق", company: "المؤسسة", portfolio: "المحفظة", program: "البرنامج", project: "المشروع", assigned: "الأدوار المسندة", rolePermissions: "الصلاحيات المسندة", noAssignments: "لا توجد أدوار مسندة.", system: "دور نظامي", custom: "دور مخصص", active: "نشط", invited: "مدعو", suspended: "معلّق", revoked: "ملغى", assignTitle: "إسناد عضو موجود", assignSub: "ابحث بالبريد عن مستخدم موجود، ثم اختره قبل منحه دورًا ونطاقًا داخل المؤسسة. لا يمكن إسناد دور إلى عضويتك الذاتية.", lookupEmail: "بريد المستخدم الموجود", findUser: "التحقق من المستخدم", findingUser: "جارٍ التحقق…", foundUser: "المستخدم المطابق", selectUser: "اختيار المستخدم", selectedUser: "المستخدم المختار", changeUser: "تغيير المستخدم", unavailableUser: "لم يُعثر على مستخدم قابل للإسناد بهذا البريد، أو لديه عضوية قائمة ضمن المؤسسة.", role: "الدور", selectRole: "اختر دورًا", scopeType: "نوع النطاق", scopeId: "معرّف النطاق", scopeIdHint: "مطلوب للنطاقات غير المؤسسية", assign: "إسناد العضو", assigning: "جارٍ إسناد العضو…", assignedSuccess: "تم إنشاء العضوية المدعوة وإسناد الدور بنجاح. يظهر التحديث في سجل الأعضاء.", noAssignableRoles: "لا يمكن إسناد عضو قبل توفر دور ضمن المؤسسة.", scopeCompanyHint: "لا يحتاج نطاق المؤسسة إلى معرّف نطاق إضافي.", createRoleTitle: "إنشاء دور مخصص", createRoleSub: "لا يمكن اختيار سوى صلاحيات المنتج المختار من كتالوج الصلاحيات. لا تتغير صلاحيات عضويتك بهذه العملية.", roleCode: "رمز الدور", roleName: "اسم الدور", product: "المنتج", choosePermissions: "اختر صلاحية واحدة على الأقل", createRole: "إنشاء الدور", creatingRole: "جارٍ إنشاء الدور…", createdRoleSuccess: "تم إنشاء الدور المخصص وربط صلاحياته. يظهر الآن ضمن سجل الأدوار.", assignExistingRoleTitle: "إسناد دور لعضوية قائمة", assignExistingRoleSub: "أضف دورًا أو نطاقًا إلى عضو قائم. يحظر الخادم أي تعديل على عضوية المنفذ نفسه.", selectMember: "اختر عضوًا", selectExistingRole: "اختر دورًا للإسناد", assignAdditionalRole: "إسناد الدور", assigningAdditionalRole: "جارٍ إسناد الدور…", assignedAdditionalRoleSuccess: "تم إسناد الدور والنطاق إلى العضوية وتسجيل الدليل التدقيقي.", revokeRole: "إلغاء إسناد الدور", revokingRole: "جارٍ إلغاء الإسناد…", revokedRoleSuccess: "تم إلغاء إسناد الدور وتسجيل الدليل التدقيقي.",
      }
    : {
        back: "Workspace", level: "Executive administration", title: "Organization members & roles", sub: "A protected view of memberships, roles, and access scopes within the authorized organization.", loading: "Loading organization administration…", members: "Members", roles: "Roles", permissions: "Permission catalog", noMembers: "No memberships are visible in this organization.", noRoles: "No tenant-specific roles are available.", noPermissions: "The permission catalog is empty.", scope: "Scope", company: "Company", portfolio: "Portfolio", program: "Program", project: "Project", assigned: "Assigned roles", rolePermissions: "Granted permissions", noAssignments: "No roles are assigned.", system: "System role", custom: "Custom role", active: "Active", invited: "Invited", suspended: "Suspended", revoked: "Revoked", assignTitle: "Assign an existing member", assignSub: "Look up an existing user by email, then select that user before assigning a role and scope in this organization. You cannot assign a role to your own membership.", lookupEmail: "Existing user email", findUser: "Find user", findingUser: "Checking user…", foundUser: "Matching user", selectUser: "Select user", selectedUser: "Selected user", changeUser: "Change user", unavailableUser: "No assignable user was found for this email, or the user already has a membership in this organization.", role: "Role", selectRole: "Select a role", scopeType: "Scope type", scopeId: "Scope ID", scopeIdHint: "Required for non-company scopes", assign: "Assign member", assigning: "Assigning member…", assignedSuccess: "The invited membership and role assignment were created. The member register has been refreshed.", noAssignableRoles: "A tenant role must be available before a member can be assigned.", scopeCompanyHint: "A company scope does not require an additional scope ID.", createRoleTitle: "Create a custom role", createRoleSub: "Only catalog permissions for the selected product may be chosen. This operation does not change your own membership privileges.", roleCode: "Role code", roleName: "Role name", product: "Product", choosePermissions: "Choose at least one permission", createRole: "Create role", creatingRole: "Creating role…", createdRoleSuccess: "The custom role and its permissions were created. It is now visible in the role register.", assignExistingRoleTitle: "Assign a role to an existing membership", assignExistingRoleSub: "Add a role or scope to an existing member. The server blocks any change to the acting manager's own membership.", selectMember: "Select a member", selectExistingRole: "Select a role to assign", assignAdditionalRole: "Assign role", assigningAdditionalRole: "Assigning role…", assignedAdditionalRoleSuccess: "The role and scope were assigned to the membership with audit evidence.", revokeRole: "Revoke role assignment", revokingRole: "Revoking assignment…", revokedRoleSuccess: "The role assignment was revoked with audit evidence.",
      };
  const membershipStatus = (status: string) => ({ active: t.active, invited: t.invited, suspended: t.suspended, revoked: t.revoked }[status] ?? status);

  if (query.isLoading) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-slate-500">{t.loading}</main>;
  if (query.error || !query.data) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-red-700">{getLocalizedProjectError(query.error, isArabic)}</main>;

  const data = query.data;
  const candidate = assignableUser.data;
  const selectedUser = targetUserId === candidate?.id ? candidate : null;
  const canAssign = data.roles.length > 0;
  const submitLookup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTargetUserId(null);
    setLookupEmail(lookupEmailInput.trim().toLowerCase());
  };
  const submitAssignment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!targetUserId) return;
    assignment.mutate({ tenantId, targetUserId, roleId, scopeType, ...(scopeType === "company" ? {} : { scopeId }) });
  };
  const availableRolePermissions = data.permissions.filter(permission => permission.productCode === newRoleProduct);
  const toggleRolePermission = (permissionCode: string) => setNewRolePermissions(current => current.includes(permissionCode) ? current.filter(code => code !== permissionCode) : [...current, permissionCode]);
  const submitRole = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    roleCreation.mutate({ tenantId, code: newRoleCode, name: newRoleName, productCode: newRoleProduct, permissionCodes: newRolePermissions });
  };
  const submitExistingMembershipRole = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    existingRoleAssignment.mutate({ tenantId, membershipId: existingMembershipId, roleId: existingMembershipRoleId, scopeType: existingMembershipScopeType, ...(existingMembershipScopeType === "company" ? {} : { scopeId: existingMembershipScopeId }) });
  };
  const revokeRoleAssignment = (assignmentId: string) => {
    setRevokingAssignmentId(assignmentId);
    roleRevocation.mutate({ tenantId, assignmentId });
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link><div className="flex gap-3"><span className="text-sm text-slate-500">{t.level}</span><LanguageToggle /></div></div></header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <section className="rounded-3xl bg-[#123a4a] p-7 text-white"><p className="text-xs font-bold tracking-[.16em] text-[#74d0c1]">PROJECT OS</p><h1 className="mt-2 text-3xl font-semibold">{t.title}</h1><p className="mt-2 text-slate-300">{t.sub}</p></section>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div className="space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#0e6b70]" />{t.assignTitle}</CardTitle><p className="text-sm leading-6 text-slate-500">{t.assignSub}</p></CardHeader><CardContent className="space-y-5">
              {canAssign ? <>
                <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submitLookup}><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="lookup-email">{t.lookupEmail}</Label><Input id="lookup-email" type="email" required value={lookupEmailInput} onChange={event => setLookupEmailInput(event.target.value)} /></div><Button type="submit" variant="outline" disabled={assignableUser.isFetching}><Search className="h-4 w-4" />{assignableUser.isFetching ? t.findingUser : t.findUser}</Button></form>
                {assignableUser.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(assignableUser.error, isArabic)}</p> : null}
                {lookupEmail && !assignableUser.isFetching && !assignableUser.error && !candidate ? <p role="status" className="text-sm text-amber-700">{t.unavailableUser}</p> : null}
                {candidate && !selectedUser ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#74d0c1] bg-[#effaf7] p-4"><div><p className="text-xs font-semibold text-slate-500">{t.foundUser}</p><p className="font-semibold">{candidate.name ?? candidate.email}</p><p className="text-sm text-slate-600">{candidate.email}</p></div><Button type="button" onClick={() => setTargetUserId(candidate.id)}><UserCheck className="h-4 w-4" />{t.selectUser}</Button></div> : null}
                {selectedUser ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0e6b70] bg-[#edf8f8] p-4"><div><p className="text-xs font-semibold text-slate-500">{t.selectedUser}</p><p className="font-semibold">{selectedUser.name ?? selectedUser.email}</p><p className="text-sm text-slate-600">{selectedUser.email}</p></div><Button type="button" variant="outline" onClick={() => setTargetUserId(null)}>{t.changeUser}</Button></div> : null}
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitAssignment}>
                  <div className="space-y-2"><Label htmlFor="member-role">{t.role} <span className="text-red-600">*</span></Label><select id="member-role" required value={roleId} onChange={event => setRoleId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="" disabled>{t.selectRole}</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.code}</option>)}</select></div>
                  <div className="space-y-2"><Label htmlFor="scope-type">{t.scopeType} <span className="text-red-600">*</span></Label><select id="scope-type" value={scopeType} onChange={event => { const next = event.target.value as ScopeType; setScopeType(next); if (next === "company") setScopeId(""); }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="company">{t.company}</option><option value="portfolio">{t.portfolio}</option><option value="program">{t.program}</option><option value="project">{t.project}</option></select></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="scope-id">{t.scopeId}{scopeType === "company" ? "" : <span className="text-red-600"> *</span>}</Label><Input id="scope-id" type="text" required={scopeType !== "company"} disabled={scopeType === "company"} value={scopeId} onChange={event => setScopeId(event.target.value)} placeholder={scopeType === "company" ? t.scopeCompanyHint : t.scopeIdHint} /></div>
                  <div className="sm:col-span-2 space-y-3"><Button type="submit" disabled={!targetUserId || assignment.isPending}>{assignment.isPending ? t.assigning : t.assign}</Button>{assignment.isSuccess ? <p role="status" className="text-sm font-medium text-emerald-700">{t.assignedSuccess}</p> : null}{assignment.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(assignment.error, isArabic)}</p> : null}</div>
                </form>
              </> : <p className="text-sm text-amber-700">{t.noAssignableRoles}</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#0e6b70]" />{t.assignExistingRoleTitle}</CardTitle><p className="text-sm leading-6 text-slate-500">{t.assignExistingRoleSub}</p></CardHeader><CardContent>{data.members.length && data.roles.length ? <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitExistingMembershipRole}><div className="space-y-2"><Label htmlFor="existing-membership">{t.selectMember}</Label><select id="existing-membership" required value={existingMembershipId} onChange={event => setExistingMembershipId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="" disabled>{t.selectMember}</option>{data.members.map(member => <option key={member.membershipId} value={member.membershipId}>{member.name ?? member.email ?? String(member.userId)}</option>)}</select></div><div className="space-y-2"><Label htmlFor="existing-role">{t.role}</Label><select id="existing-role" required value={existingMembershipRoleId} onChange={event => setExistingMembershipRoleId(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="" disabled>{t.selectExistingRole}</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.code}</option>)}</select></div><div className="space-y-2"><Label htmlFor="existing-scope-type">{t.scopeType}</Label><select id="existing-scope-type" value={existingMembershipScopeType} onChange={event => { const next = event.target.value as ScopeType; setExistingMembershipScopeType(next); if (next === "company") setExistingMembershipScopeId(""); }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="company">{t.company}</option><option value="portfolio">{t.portfolio}</option><option value="program">{t.program}</option><option value="project">{t.project}</option></select></div><div className="space-y-2"><Label htmlFor="existing-scope-id">{t.scopeId}</Label><Input id="existing-scope-id" required={existingMembershipScopeType !== "company"} disabled={existingMembershipScopeType === "company"} value={existingMembershipScopeId} onChange={event => setExistingMembershipScopeId(event.target.value)} placeholder={existingMembershipScopeType === "company" ? t.scopeCompanyHint : t.scopeIdHint} /></div><div className="sm:col-span-2 space-y-3"><Button type="submit" disabled={existingRoleAssignment.isPending}>{existingRoleAssignment.isPending ? t.assigningAdditionalRole : t.assignAdditionalRole}</Button>{existingRoleAssignment.isSuccess ? <p role="status" className="text-sm font-medium text-emerald-700">{t.assignedAdditionalRoleSuccess}</p> : null}{existingRoleAssignment.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(existingRoleAssignment.error, isArabic)}</p> : null}</div></form> : <p className="text-sm text-amber-700">{t.noAssignableRoles}</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-[#0e6b70]" />{t.members}</CardTitle></CardHeader><CardContent className="space-y-3">{roleRevocation.isSuccess ? <p role="status" className="text-sm font-medium text-emerald-700">{t.revokedRoleSuccess}</p> : null}{roleRevocation.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(roleRevocation.error, isArabic)}</p> : null}{data.members.length ? data.members.map(member => <div key={member.membershipId} className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{member.name ?? member.email ?? String(member.userId)}</p><p className="text-sm text-slate-500">{member.email}</p></div><Badge variant="secondary">{membershipStatus(member.status)}</Badge></div><p className="mt-3 text-xs font-semibold text-slate-500">{t.assigned}</p>{member.roles.length ? <div className="mt-2 flex flex-wrap gap-2">{member.roles.map(role => <div key={role.assignmentId} className="flex items-center gap-1"><Badge variant="outline">{role.roleName} · {t.scope}: {role.scopeType === "company" ? t.company : role.scopeId}</Badge><Button type="button" size="sm" variant="outline" disabled={roleRevocation.isPending} onClick={() => revokeRoleAssignment(role.assignmentId)}>{roleRevocation.isPending && revokingAssignmentId === role.assignmentId ? t.revokingRole : t.revokeRole}</Button></div>)}</div> : <p className="mt-2 text-sm text-slate-500">{t.noAssignments}</p>}</div>) : <p className="text-sm text-slate-500">{t.noMembers}</p>}</CardContent></Card>
          </div>
          <div className="space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldPlus className="h-5 w-5 text-[#0e6b70]" />{t.createRoleTitle}</CardTitle><p className="text-sm leading-6 text-slate-500">{t.createRoleSub}</p></CardHeader><CardContent><form className="space-y-4" onSubmit={submitRole}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-role-code">{t.roleCode}</Label><Input id="new-role-code" required minLength={3} maxLength={80} value={newRoleCode} onChange={event => setNewRoleCode(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="new-role-name">{t.roleName}</Label><Input id="new-role-name" required minLength={2} maxLength={160} value={newRoleName} onChange={event => setNewRoleName(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="new-role-product">{t.product}</Label><select id="new-role-product" value={newRoleProduct} onChange={event => { setNewRoleProduct(event.target.value as "EXECUTIVE" | "PMO" | "PROJECT"); setNewRolePermissions([]); }} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"><option value="EXECUTIVE">EXECUTIVE</option><option value="PMO">PMO</option><option value="PROJECT">PROJECT</option></select></div><fieldset className="space-y-2"><legend className="text-sm font-medium">{t.choosePermissions}</legend><div className="grid gap-2">{availableRolePermissions.map(permission => <label key={permission.code} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={newRolePermissions.includes(permission.code)} onChange={() => toggleRolePermission(permission.code)} />{permission.code} · {permission.name}</label>)}</div></fieldset><Button type="submit" disabled={roleCreation.isPending || newRolePermissions.length === 0}>{roleCreation.isPending ? t.creatingRole : t.createRole}</Button>{roleCreation.isSuccess ? <p role="status" className="text-sm font-medium text-emerald-700">{t.createdRoleSuccess}</p> : null}{roleCreation.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(roleCreation.error, isArabic)}</p> : null}</form></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#0e6b70]" />{t.roles}</CardTitle></CardHeader><CardContent className="space-y-3">{data.roles.length ? data.roles.map(role => <div key={role.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{role.name}</p><Badge variant="secondary">{role.systemManaged ? t.system : t.custom}</Badge></div><p className="mt-1 text-xs text-slate-500">{role.code} · {role.productCode ?? "—"}</p><p className="mt-3 text-xs font-semibold text-slate-500">{t.rolePermissions}</p><div className="mt-2 flex flex-wrap gap-2">{role.permissions.map(permission => <Badge key={permission.code} variant="outline">{permission.code}</Badge>)}</div></div>) : <p className="text-sm text-slate-500">{t.noRoles}</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#0e6b70]" />{t.permissions}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{data.permissions.length ? data.permissions.map(permission => <Badge key={permission.code} variant="outline">{permission.code} · {permission.productCode}</Badge>) : <p className="text-sm text-slate-500">{t.noPermissions}</p>}</CardContent></Card></div>
        </div>
      </div>
    </main>
  );
}
