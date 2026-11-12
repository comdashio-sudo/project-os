import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell, DirectionProvider, type Crumb, type NavItem } from "@/components/ds";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { Briefcase, FolderKanban, Gauge, Layers, LayoutPanelTop, Settings, SlidersHorizontal, Target, Users, Wallet, type LucideIcon } from "lucide-react";
import { InShellProvider } from "@/components/pageFrame";
import React from "react";
import { useLocation } from "wouter";

// The one frame for every company screen (work order 21, step 1): a single top bar (logo, company and project switchers, language, person),
// one sidebar of the modules this person may open, and one breadcrumb trail. The modules come from the server (navigation.get), so a person sees
// only what their roles allow. Direction A is the platform's visual direction (owner's choice, work order 21).
const MODULE_LABELS: Record<string, { ar: string; en: string; ur: string }> = {
  "navigation.levels": { ar: "المستويات", en: "Levels", ur: "سطحیں" },
  "navigation.executiveDashboard": { ar: "القيادة التنفيذية", en: "Executive", ur: "ایگزیکٹو" },
  "navigation.pmoDashboard": { ar: "PMO", en: "PMO", ur: "PMO" },
  "navigation.projectRegistry": { ar: "سجل المشاريع", en: "Project registry", ur: "پروجیکٹ رجسٹر" },
  "navigation.employeeRegistry": { ar: "الموظفون والقوى العاملة", en: "People & workforce", ur: "افراد اور افرادی قوت" },
  "navigation.payroll": { ar: "الرواتب وتكلفة العمالة", en: "Payroll & labor cost", ur: "تنخواہ اور لیبر لاگت" },
  "navigation.projectControls": { ar: "ضوابط المشروع", en: "Project controls", ur: "پروجیکٹ کنٹرولز" },
  "navigation.myPerformance": { ar: "مؤشراتي", en: "My indicators", ur: "میرے اشاریے" },
  "navigation.tenantAdministration": { ar: "إدارة الشركة", en: "Tenant administration", ur: "کمپنی کا انتظام" },
};
// One icon per module (design brief D-2: one icon for every module is not allowed); an unknown module falls back to the generic panel.
const MODULE_ICONS: Record<string, LucideIcon> = {
  "levels": Layers,
  "executive-dashboard": Gauge,
  "pmo-dashboard": Briefcase,
  "project-registry": FolderKanban,
  "employee-registry": Users,
  "payroll": Wallet,
  "project-controls": SlidersHorizontal,
  "my-performance": Target,
  "tenant-administration": Settings,
};
const WORKSPACE = { ar: "مساحة العمل", en: "Workspace", ur: "ورک اسپیس" };
const SOURCE_TITLES = {
  navigation: { ar: "القائمة الجانبية", en: "side menu", ur: "سائیڈ مینو" },
  companies: { ar: "قائمة الشركات", en: "company list", ur: "کمپنیوں کی فہرست" },
  projects: { ar: "قائمة المشاريع", en: "project list", ur: "پروجیکٹوں کی فہرست" },
};

// The phone screens (/m/…) and the setup wizard (/setup/…) carry :tenantId but are full-screen flows of their own: they are not framed.
const UNFRAMED_ROOTS = new Set(["m", "setup"]);
export function isFramedPath(path: string): boolean {
  return !UNFRAMED_ROOTS.has(path.split("?")[0].split("/")[1] ?? "");
}

// Choosing another project keeps the person on the same screen of the other project when the current address names a project
// (/projects/t/p/quality → /projects/t/q/quality, /levels/t/projects/p → /levels/t/projects/q); otherwise it opens that project's controls page.
// There is no /projects/:tenantId/:projectId route, so the address must never stop at the project (code review of #156, item 1).
export function projectSwitchHref(location: string, tenantId: string, current: string | undefined, next: string): string {
  const path = location.split("?")[0];
  if (current) {
    const segments = path.split("/");
    if (segments.includes(current)) return segments.map(segment => (segment === current ? next : segment)).join("/");
  }
  return `/projects/${tenantId}/${next}/controls`;
}

export function ProductShell({ tenantId, projectId, children }: { tenantId: string; projectId?: string; children: React.ReactNode }) {
  const { language } = useLanguage();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const navigation = trpc.navigation.get.useQuery(projectId ? { tenantId, projectId } : { tenantId });
  const tenants = trpc.tenant.mine.useQuery();
  const projects = trpc.projects.list.useQuery({ tenantId });

  const nav: NavItem[] = (navigation.data ?? []).map(item => ({
    id: item.id,
    label: MODULE_LABELS[item.labelKey] ? pickLanguage(language, MODULE_LABELS[item.labelKey]) : item.id,
    icon: MODULE_ICONS[item.id] ?? LayoutPanelTop,
    href: item.href,
  }));
  // The module the person is in: the LONGEST link the address equals or starts with followed by "/" (so /p1 never matches /p10). The registry's
  // /projects/:tenantId is a prefix of every project address, so on a project page whose longest match is the registry (or nothing), the
  // module is "Project controls"; a project page with its own module (e.g. my-performance) keeps it.
  const projectBase = projectId ? `/projects/${tenantId}/${projectId}` : undefined;
  const onProject = Boolean(projectBase) && (location === projectBase || location.startsWith(`${projectBase}/`));
  const controlsId = (navigation.data ?? []).find(item => item.labelKey === "navigation.projectControls")?.id;
  const registryHref = `/projects/${tenantId}`;
  const matching = nav.filter(item => item.href && (location === item.href || location.startsWith(`${item.href}/`))).sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  const longest = matching[0];
  const active = onProject && controlsId && (!longest || longest.href === registryHref) ? nav.find(item => item.id === controlsId) ?? longest : longest;
  const isArabic = language === "ar";
  // A failed source says so above the page: an empty side menu or switcher must not look like "nothing here" (G-100).
  const notices = (
    <>
      <SourceNotice query={navigation} isArabic={isArabic} title={pickLanguage(language, SOURCE_TITLES.navigation)} />
      <SourceNotice query={tenants} isArabic={isArabic} title={pickLanguage(language, SOURCE_TITLES.companies)} />
      <SourceNotice query={projects} isArabic={isArabic} title={pickLanguage(language, SOURCE_TITLES.projects)} />
    </>
  );
  const crumbs: Crumb[] = [{ label: pickLanguage(language, WORKSPACE), href: "/" }];
  // a project screen names its project between the workspace and the module
  const currentProject = projectId ? (projects.data ?? []).find(item => item.id === projectId) : undefined;
  if (currentProject) crumbs.push({ label: `${currentProject.code} · ${currentProject.name}`, href: `/projects/${tenantId}/${projectId}/controls` });
  if (active) crumbs.push({ label: active.label });

  const companies = (tenants.data ?? []).map(item => ({ value: item.tenantId, label: item.legalName }));
  const projectOptions = (projects.data ?? []).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }));

  return (
    <DirectionProvider direction="a">
      <AppShell
        nav={nav}
        activeId={active?.id ?? ""}
        onNavigate={item => { if (item.href) setLocation(item.href); }}
        companies={companies}
        company={tenantId}
        onCompany={value => setLocation(`/projects/${value}`)}
        projects={projectOptions}
        project={projectId ?? ""}
        onProject={value => setLocation(projectSwitchHref(location, tenantId, projectId, value))}
        breadcrumbs={crumbs}
        user={{ name: user?.name ?? "", email: user?.email ?? "" }}
        onSignOut={() => { void logout(); }}
        onMyCompanies={() => setLocation(`/companies/${tenantId}`)}
      >
        {notices}
        <InShellProvider>{children}</InShellProvider>
      </AppShell>
    </DirectionProvider>
  );
}
