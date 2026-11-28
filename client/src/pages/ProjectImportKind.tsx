// Q-56 (1): each card of the import page opens the import of ITS kind, on a page of its own, instead of all three landing on the same group of the project
// board (controls#manager-assurance, where the first thing on screen was the reference lists — labour — whatever card was pressed). The screens are the
// same components the board shows, unchanged; this page only puts one of them on its own address with its own title.
import { P6ImportCard } from "@/components/P6ImportCard";
import React from "react";
import { Link, useParams } from "wouter";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { PAGE_NAMES } from "@shared/pageNames";
import { ProjectImports } from "./ProjectImports";
import { ProjectOperationalImports } from "./ProjectOperationalImports";
import { ProjectReferenceLists } from "./ProjectReferenceLists";
import { ProjectMasterPlan } from "./ProjectMasterPlan";
import { MasterPlanDrawing } from "@/components/MasterPlanDrawing";
import { SectionErrorBoundary } from "@/components/SectionResilience";

type Text = { ar: string; en: string; ur: string };
export const IMPORT_KINDS = ["programme", "operational", "reference", "master-plan"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_KIND_TITLES: Record<ImportKind, Text> = {
  programme: { ar: "استيراد البرنامج الزمني والتكلفة", en: "Import the programme and cost", ur: "پروگرام اور لاگت کی درآمد" },
  operational: { ar: "استيراد البيانات التشغيلية", en: "Import operational data", ur: "آپریشنل ڈیٹا کی درآمد" },
  reference: { ar: "استيراد القوائم المرجعية", en: "Import reference lists", ur: "حوالہ جاتی فہرستوں کی درآمد" },
  "master-plan": { ar: "مخطط الماستر بلان: الرفع والمعايرة", en: "Master plan drawing: upload and calibrate", ur: "ماسٹر پلان کا نقشہ: اپ لوڈ اور کیلیبریشن" },
};

const back: Text = { ar: "كل أنواع الاستيراد", en: "All kinds of import", ur: "درآمد کی تمام اقسام" };

export default function ProjectImportKind() {
  const { tenantId = "", projectId = "", kind = "" } = useParams<{ tenantId: string; projectId: string; kind: string }>();
  const { language, isArabic } = useLanguage();
  const known = (IMPORT_KINDS as readonly string[]).includes(kind) ? (kind as ImportKind) : null;
  const scope = { tenantId, projectId };
  return (
    <PageMain className="flex min-w-0 flex-col gap-5 [&>*]:min-w-0" data-import-kind={known ?? "unknown"}>
      <PageTitle eyebrow={<Link href={`/projects/${tenantId}/${projectId}/import`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{pickLanguage(language, back)}</Link>}
        title={known ? pickLanguage(language, IMPORT_KIND_TITLES[known]) : pickLanguage(language, PAGE_NAMES.imports)} />
      {/* each screen in its own boundary: a failure in one (the drawing, the plan board) never takes the page down (G-100) */}
      {known ? (known === "master-plan" ? [MasterPlanDrawing, ProjectMasterPlan] : [...(known === "programme" ? [P6ImportCard] : []), { programme: ProjectImports, operational: ProjectOperationalImports, reference: ProjectReferenceLists }[known]]).map((Screen, index) => (
        <SectionErrorBoundary key={index} title={pickLanguage(language, IMPORT_KIND_TITLES[known])} isArabic={isArabic}><Screen {...scope} /></SectionErrorBoundary>
      )) : null}
      {!known ? <p className="text-sm text-muted-foreground">{pickLanguage(language, back)}</p> : null}
    </PageMain>
  );
}
