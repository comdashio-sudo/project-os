import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell, DirectionProvider, type Crumb, type NavItem } from "@/components/ds";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { BarChart3, Building2, ClipboardList, FolderKanban, Gauge, Layers, LayoutPanelTop, type LucideIcon, Settings2, UsersRound, Wallet } from "lucide-react";
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
const MODULE_ICONS: Record<string, LucideIcon> = {
  "navigation.levels": Layers, "navigation.executiveDashboard": BarChart3, "navigation.pmoDashboard": ClipboardList, "navigation.projectRegistry": FolderKanban,
  "navigation.employeeRegistry": UsersRound, "navigation.payroll": Wallet, "navigation.projectControls": Gauge, "navigation.myPerformance": LayoutPanelTop,
  "navigation.tenantAdministration": Settings2,
};
const WORKSPACE = { ar: "مساحة العمل", en: "Workspace", ur: "ورک اسپیس" };
const SOURCE_TITLES = {
  navigation: { ar: "القائمة الجانبية", en: "side menu", ur: "سائیڈ مینو" },
  companies: { ar: "قائمة الشركات", en: "company list", ur: "کمپنیوں کی فہرست" },
  projects: { ar: "قائمة المشاريع", en: "project list", ur: "پروجیکٹوں کی فہرست" },
};

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
    icon: MODULE_ICONS[item.labelKey] ?? Building2,
    href: item.href,
  }));
  const active = nav.find(item => item.href && location === item.href) ?? nav.find(item => item.href && location.startsWith(item.href));
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
        onProject={value => setLocation(`/projects/${tenantId}/${value}`)}
        breadcrumbs={crumbs}
        user={{ name: user?.name ?? "", email: user?.email ?? "" }}
        onSignOut={() => { void logout(); }}
      >
        {notices}
        {children}
      </AppShell>
    </DirectionProvider>
  );
}
