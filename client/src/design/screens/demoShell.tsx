import React, { useState } from "react";
import { FolderKanban, LayoutDashboard, Rocket, Settings, Upload, Users } from "lucide-react";
import { AppShell, type NavItem } from "@/components/ds";
import { useDirection, type Mode } from "@/components/ds/direction";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

// A shell filled with SYNTHETIC data, used by the two redrawn screens of the design preview. Nothing here is a real company, project or person.
const names = {
  ar: { overview: "نظرة عامة", projects: "المشاريع", setup: "الإعداد", import: "استيراد البيانات", team: "الفريق", settings: "الإعدادات", home: "الرئيسية", demoCo: "شركة البناء النموذجية", demoCo2: "شركة الأمثلة للتطوير", phase1: "فلل النموذج، المرحلة 1", phase2: "أبراج الأمثلة", user: "مستخدم تجريبي" },
  en: { overview: "Overview", projects: "Projects", setup: "Setup", import: "Import data", team: "Team", settings: "Settings", home: "Home", demoCo: "Sample Builders Co.", demoCo2: "Example Development Co.", phase1: "Sample Villas, phase 1", phase2: "Example Towers", user: "Demo user" },
  ur: { overview: "جائزہ", projects: "پروجیکٹس", setup: "سیٹ اپ", import: "ڈیٹا درآمد", team: "ٹیم", settings: "ترتیبات", home: "ہوم", demoCo: "نمونہ بلڈرز کمپنی", demoCo2: "مثالی ڈیولپمنٹ کمپنی", phase1: "نمونہ ولاز، مرحلہ 1", phase2: "مثالی ٹاورز", user: "تجرباتی صارف" },
};
export const useDemoNames = () => pickLanguage(useLanguage().language, names);

export function DemoShell({ activeId, crumbs, children }: { activeId: "setup" | "import"; crumbs: string[]; children: React.ReactNode }) {
  const n = useDemoNames();
  const { mode } = useDirection();
  const [company, setCompany] = useState("a"); const [project, setProject] = useState("p1");
  const [localMode, setLocalMode] = useState<Mode>(mode);
  const nav: NavItem[] = [
    { id: "overview", label: n.overview, icon: LayoutDashboard }, { id: "projects", label: n.projects, icon: FolderKanban }, { id: "setup", label: n.setup, icon: Rocket },
    { id: "import", label: n.import, icon: Upload }, { id: "team", label: n.team, icon: Users }, { id: "settings", label: n.settings, icon: Settings },
  ];
  return (
    <AppShell nav={nav} activeId={activeId} onNavigate={() => undefined}
      companies={[{ value: "a", label: n.demoCo }, { value: "b", label: n.demoCo2 }]} company={company} onCompany={setCompany}
      projects={[{ value: "p1", label: n.phase1 }, { value: "p2", label: n.phase2 }]} project={project} onProject={setProject}
      breadcrumbs={[{ label: n.home, href: "#" }, ...crumbs.map((label, index) => ({ label, href: index < crumbs.length - 1 ? "#" : undefined }))]}
      user={{ name: n.user, email: "demo@mail.example.test" }} mode={localMode} onModeChange={setLocalMode}>
      {children}
    </AppShell>
  );
}
