import { indicatorBasisLine } from "@/lib/indicatorBasis";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { MetricCard, formatDate, formatNumber } from "@/components/ds";
import { UPLOAD_ANY_FILE_FALLBACK_GROUP, uploadAnyFileHref } from "@/lib/uploadAnyFile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { localizedHealthException, parseStoredHealthExceptions, parseStoredHealthSources } from "@/lib/healthPresentation";
import { trpc } from "@/lib/trpc";
import { ProjectDesign as ProjectDesignContent } from "./ProjectDesign";
import { ProjectTenders as ProjectTendersContent } from "./ProjectTenders";
import { ProjectContracts as ProjectContractsContent } from "./ProjectContracts";
import { ProjectDocuments as ProjectDocumentsContent } from "./ProjectDocuments";
import { ProjectRfis as ProjectRfisContent } from "./ProjectRfis";
import { ProjectNcrs as ProjectNcrsContent } from "./ProjectNcrs";
import { ProjectHse as ProjectHseContent } from "./ProjectHse";
import { ProjectFieldReports as ProjectFieldReportsContent } from "./ProjectFieldReports";
import { ProjectQualityInspections as ProjectQualityInspectionsContent } from "./ProjectQualityInspections";
import { ProjectPurchaseOrders as ProjectPurchaseOrdersContent } from "./ProjectPurchaseOrders";
import { ProjectGoodsReceipts as ProjectGoodsReceiptsContent } from "./ProjectGoodsReceipts";
import { ProjectProcurement as ProjectProcurementContent } from "./ProjectProcurement";
import { ProjectChanges as ProjectChangesContent } from "./ProjectChanges";
import { ProjectNotifications as ProjectNotificationsContent } from "./ProjectNotifications";
import { ProjectResources as ProjectResourcesContent } from "./ProjectResources";
import { ProjectWorkforce as ProjectWorkforceContent } from "./ProjectWorkforce";
import { ProjectMaterials as ProjectMaterialsContent } from "./ProjectMaterials";
import { ProjectWarehouses as ProjectWarehousesContent } from "./ProjectWarehouses";
import { ProjectClaims as ProjectClaimsContent } from "./ProjectClaims";
import { ProjectAdvisor as ProjectAdvisorContent } from "./ProjectAdvisor";
import { ProjectImports as ProjectImportsContent } from "./ProjectImports";
import { ProjectOperationalImports as ProjectOperationalImportsContent } from "./ProjectOperationalImports";
import { ProjectDataExport as ProjectDataExportContent } from "./ProjectDataExport";
import { ProjectMasterPlan as ProjectMasterPlanContent } from "./ProjectMasterPlan";
import { MasterPlanDrawing as MasterPlanDrawingContent } from "@/components/MasterPlanDrawing";
import { ProjectPmcWorkspace } from "./ProjectPmc";
import { PlanningControlCenter } from "@/components/PlanningControlCenter";
import { calculatePlanningControl } from "@/lib/planningControl";
import { DashboardSectionReporter } from "@/components/DashboardSectionReporter";
import { SectionErrorBoundary, SectionMessage } from "@/components/SectionResilience";
import { Activity, ArrowLeft, Banknote, FileUp, CalendarDays, Calculator, CheckCircle2, ClipboardList, FileCheck2, HeartPulse, PackageCheck, Plus, ShieldCheck, TrendingUp } from "lucide-react";
import React, { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ProjectStart } from "@/components/ProjectStart";
import { ProjectUploadContext, SectionActions } from "@/components/SectionActions";
import { anyImportPermission } from "@shared/importPermissions";
import { enumLabel } from "@/lib/labels";
import { WriteGate, useCan } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";
import { CheckedForm } from "@/components/CheckedForm";
import { GridEditor, gridNumber } from "@/components/GridEditor";

const today = new Date().toISOString().slice(0, 10);
const emptyPlanningQuery = { data: undefined, isLoading: false, error: null, refetch: async () => undefined };

function withProjectSectionBoundary<P extends object>(Component: React.ComponentType<P>, titles: { ar: string; en: string; ur: string }) {
  return function ProjectSectionBoundary(props: P) {
    const { isArabic, language } = useLanguage();
    return <SectionErrorBoundary title={pickLanguage(language, titles)} isArabic={isArabic}><Component {...props} /></SectionErrorBoundary>;
  };
}

const ProjectContracts = withProjectSectionBoundary(ProjectContractsContent, { ar: "العقود", en: "Contracts", ur: "معاہدے" });
const ProjectTenders = withProjectSectionBoundary(ProjectTendersContent, { ar: "المناقصات قبل الترسية", en: "Tenders before award", ur: "ایوارڈ سے پہلے کے ٹینڈرز" });
const ProjectDesign = withProjectSectionBoundary(ProjectDesignContent, { ar: "التنسيق الفني والمعماري", en: "Technical and architectural coordination", ur: "تکنیکی اور تعمیراتی ہم آہنگی" });
const ProjectProcurement = withProjectSectionBoundary(ProjectProcurementContent, { ar: "طلبات المواد", en: "Procurement requests", ur: "مادّوں کی درخواستیں" });
const ProjectPurchaseOrders = withProjectSectionBoundary(ProjectPurchaseOrdersContent, { ar: "أوامر الشراء", en: "Purchase orders", ur: "خریداری کے آرڈرز" });
const ProjectGoodsReceipts = withProjectSectionBoundary(ProjectGoodsReceiptsContent, { ar: "استلام المواد", en: "Goods receipts", ur: "مال کی وصولی" });
const ProjectClaims = withProjectSectionBoundary(ProjectClaimsContent, { ar: "المطالبات", en: "Claims", ur: "دعوے" });
const ProjectDocuments = withProjectSectionBoundary(ProjectDocumentsContent, { ar: "المستندات", en: "Documents", ur: "دستاویزات" });
const ProjectFieldReports = withProjectSectionBoundary(ProjectFieldReportsContent, { ar: "التقارير الميدانية", en: "Field reports", ur: "فیلڈ رپورٹس" });
const ProjectQualityInspections = withProjectSectionBoundary(ProjectQualityInspectionsContent, { ar: "فحوص الجودة", en: "Quality inspections", ur: "معیار کے معائنے" });
const ProjectHse = withProjectSectionBoundary(ProjectHseContent, { ar: "الصحة والسلامة والبيئة", en: "HSE observations", ur: "HSE مشاہدات" });
const ProjectRfis = withProjectSectionBoundary(ProjectRfisContent, { ar: "طلبات المعلومات", en: "RFIs", ur: "معلومات کی درخواستیں (RFIs)" });
const ProjectNcrs = withProjectSectionBoundary(ProjectNcrsContent, { ar: "حالات عدم المطابقة", en: "NCRs", ur: "عدم مطابقت کی رپورٹیں (NCRs)" });
const ProjectChanges = withProjectSectionBoundary(ProjectChangesContent, { ar: "طلبات التغيير", en: "Change requests", ur: "تبدیلی کی درخواستیں" });
const ProjectResources = withProjectSectionBoundary(ProjectResourcesContent, { ar: "الموارد", en: "Resources", ur: "وسائل" });
const ProjectWorkforce = withProjectSectionBoundary(ProjectWorkforceContent, { ar: "القوى العاملة والإسناد", en: "Workforce and assignments", ur: "افرادی قوت اور تفویض" });
const ProjectMaterials = withProjectSectionBoundary(ProjectMaterialsContent, { ar: "المواد", en: "Materials", ur: "مادّے" });
const ProjectWarehouses = withProjectSectionBoundary(ProjectWarehousesContent, { ar: "المستودعات", en: "Warehouses", ur: "گودام" });
const ProjectImports = withProjectSectionBoundary(ProjectImportsContent, { ar: "استيراد البيانات", en: "Data imports", ur: "ڈیٹا امپورٹس" });
const ProjectOperationalImports = withProjectSectionBoundary(ProjectOperationalImportsContent, { ar: "Excel للبيانات التشغيلية", en: "Excel for operational data", ur: "آپریشنل ڈیٹا کے لیے Excel" });
const ProjectDataExport = withProjectSectionBoundary(ProjectDataExportContent, { ar: "تصدير البيانات", en: "Data exports", ur: "ڈیٹا ایکسپورٹس" });
const ProjectMasterPlan = withProjectSectionBoundary(ProjectMasterPlanContent, { ar: "الخطة الرئيسية", en: "Master plan", ur: "ماسٹر پلان" });
const MasterPlanDrawing = withProjectSectionBoundary(MasterPlanDrawingContent, { ar: "رسم الخطة التفاعلي", en: "Interactive drawing", ur: "انٹرایکٹو ڈرائنگ" });
const ProjectAdvisor = withProjectSectionBoundary(ProjectAdvisorContent, { ar: "المستشار", en: "Project advisor", ur: "پروجیکٹ ایڈوائزر" });
const ProjectNotifications = withProjectSectionBoundary(ProjectNotificationsContent, { ar: "إشعارات المشروع", en: "Project notifications", ur: "پروجیکٹ اطلاعات" });

export default function ProjectControls() {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, language } = useLanguage();
  const scheduleQuery = trpc.projects.getControlsSchedule.useQuery({ tenantId, projectId });
  const financialsQuery = trpc.projects.getControlsFinancials.useQuery({ tenantId, projectId });
  const performanceQuery = trpc.projects.getControlsPerformance.useQuery({ tenantId, projectId });
  const boqQuery = (trpc.boq?.list?.useQuery ?? (() => emptyPlanningQuery))({ tenantId, projectId });
  const procurementQuery = (trpc.procurement?.register?.useQuery ?? (() => emptyPlanningQuery))({ tenantId, projectId });
  const warehouseQuery = (trpc.warehouses?.list?.useQuery ?? (() => emptyPlanningQuery))({ tenantId, projectId });
  const contractsQuery = (trpc.contracts?.getProjectRegister?.useQuery ?? (() => emptyPlanningQuery))({ tenantId, projectId });
  const refresh = () => { scheduleQuery.refetch(); financialsQuery.refetch(); performanceQuery.refetch(); boqQuery.refetch(); procurementQuery.refetch(); warehouseQuery.refetch(); contractsQuery.refetch(); };
  const createWbs = trpc.wbs.create.useMutation({ onSuccess: refresh });
  const createActivity = trpc.activities.create.useMutation({ onSuccess: refresh });
  const createBudget = trpc.budgets.create.useMutation({ onSuccess: refresh });
  // D-74 (b): the sheets save each row by the same procedures, through their own mutations, so a row's refusal is said on its row and not again above the page
  const sheetWbs = trpc.wbs.create.useMutation();
  const sheetBudget = trpc.budgets.create.useMutation();
  const createCost = trpc.costs.createActual.useMutation({ onSuccess: refresh });
  const createProgress = trpc.progress.create.useMutation({ onSuccess: refresh });
  const saveEvm = trpc.controls.saveEvmSnapshot.useMutation({ onSuccess: refresh });
  const captureOperationalEvm = trpc.controls.captureOperationalEvmSnapshot.useMutation({ onSuccess: refresh });
  const captureProjectHealth = trpc.controls.captureProjectHealthSnapshot.useMutation({ onSuccess: refresh });

  const [wbs, setWbs] = useState({ code: "", name: "", plannedValue: "" });
  const [activity, setActivity] = useState({ wbsItemId: "project", code: "", name: "", plannedValue: "", plannedStartAt: today, plannedFinishAt: today });
  const [budget, setBudget] = useState({ wbsItemId: "project", costCode: "", originalAmount: "", currentAmount: "" });
  const [cost, setCost] = useState({ wbsItemId: "project", amount: "", incurredAt: today });
  const [progress, setProgress] = useState({ wbsItemId: "", percentComplete: "", reportedAt: today });
  const [evm, setEvm] = useState({ periodAt: today, pv: "", ev: "", ac: "", bac: "", eacMethod: "bac_over_cpi" as const });
  const [operationalPeriod, setOperationalPeriod] = useState(today);
  const [view, setView] = useState<"overview" | "pmc">(typeof window !== "undefined" && window.location.hash === "#pmc" ? "pmc" : "overview");
  React.useEffect(() => { const onChange = () => { if (window.location.hash === "#pmc") setView("pmc"); }; window.addEventListener("hashchange", onChange); return () => window.removeEventListener("hashchange", onChange); }, []);
  const [healthPeriod, setHealthPeriod] = useState(today);
  // D-1: no button the server refuses. "Upload" only for a person who may import something (the gate ProjectImports uses), "+ Add" / "Add by hand"
  // only for one who may write the section's records.
  const canImport = useCan(anyImportPermission, projectId);
  const canWriteSchedule = useCan(["project.wbs.manage", "project.schedule.manage"], projectId);
  const canWriteRecords = useCan(["project.budget.manage", "project.cost.enter", "project.progress.manage"], projectId);
  const [, navigate] = useLocation();

  const t = pickLanguage(language, { ar: {
        registry: "سجل المشاريع", level: "المستوى 3 · تسليم المشروع", loading: "جارٍ تحميل ضوابط المشروع…", project: "المشروع", title: "لوحة تسليم المشروع", subtitle: "سجل البيانات التشغيلية أولاً، ثم احفظ لقطة EVM موثقة وقابلة للتدقيق.", wbs: "هيكل تجزئة العمل", activities: "الأنشطة والجدولة", budget: "الميزانية", cost: "التكلفة الفعلية", progress: "التقدم", snapshot: "لقطة EVM", health: "صحة المشروع", healthNote: "تستخدم اللقطة أحدث EVM والمخاطر عالية التعرض والإجراءات وطلبات المعلومات وحالات عدم المطابقة المتأخرة. لا توجد بعد مصادر للموافقات، ولذلك تدخل بقيم صفرية معلنة.", captureHealth: "حساب وحفظ لقطة الصحة", healthPending: "جارٍ حساب الصحة…", healthExceptions: "استثناءات الصحة وخطط التعافي", score: "الدرجة", confidence: "الثقة", highRisks: "مخاطر عالية", overdueActions: "إجراءات متأخرة", overdueRfis: "طلبات معلومات متأخرة", overdueNcrs: "حالات عدم مطابقة متأخرة", noHealth: "لا توجد لقطة صحة محفوظة حتى الآن.", code: "الرمز", name: "الاسم", planned: "القيمة المخططة", start: "البداية المخططة", finish: "النهاية المخططة", addWbs: "إضافة بند WBS", addActivity: "جدولة نشاط", activityLink: "ربط WBS (اختياري)", noActivities: "لا توجد أنشطة مجدولة حتى الآن.", notStarted: "لم يبدأ", inProgress: "قيد التنفيذ", completed: "مكتمل", blocked: "متعثر", costCode: "رمز التكلفة", original: "الميزانية الأصلية", current: "الميزانية الحالية", link: "ربط WBS", projectLevel: "على مستوى المشروع", addBudget: "تسجيل بند الميزانية", amount: "القيمة", date: "التاريخ", addCost: "تسجيل تكلفة فعلية", percent: "نسبة الإنجاز", addProgress: "تسجيل التقدم", pv: "PV القيمة المخططة", ev: "EV القيمة المكتسبة", ac: "AC التكلفة الفعلية", bac: "BAC الميزانية عند الإتمام", save: "حفظ لقطة EVM", latest: "أحدث لقطة", noSnapshot: "لا توجد لقطة EVM محفوظة حتى الآن.", emptyWbs: "أضف بند WBS أولًا لربط الميزانيات والتكاليف والتقدم.", entries: "القيود المسجلة", noEntries: "لا توجد قيود تشغيلية حتى الآن.", submitting: "جارٍ الحفظ…", actual: "فعلي", recorded: "مسجل", captureNote: "تدخل قيم لقطة EVM يدويًا في هذه الدفعة. لا تدّعي الواجهة أنها محسوبة من سجلات التشغيل قبل اكتمال محرك التجميع.", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC", contractsAndDocuments: "العقود والمستندات والمطالبات", siteDelivery: "سجل الموقع والجودة", planningAndData: "التخطيط وملفات البيانات", supportAndOversight: "المتابعة والذكاء والإشعارات",
      }, en: {
        registry: "Project registry", level: "Level 3 · Project Delivery", loading: "Loading project controls…", project: "Project", title: "Project delivery board", subtitle: "Record operational data first, then save a traceable EVM snapshot.", wbs: "Work breakdown structure", activities: "Activities & schedule", budget: "Budget", cost: "Actual cost", progress: "Progress", snapshot: "EVM snapshot", health: "Project health", healthNote: "This snapshot uses the latest EVM, high-exposure risks, overdue actions, overdue RFIs, and overdue NCRs. Approval sources do not exist yet, so they enter as explicit zero values.", captureHealth: "Calculate and save health snapshot", healthPending: "Calculating health…", healthExceptions: "Health exceptions & recovery plans", score: "Score", confidence: "Confidence", highRisks: "High-exposure risks", overdueActions: "Overdue actions", overdueRfis: "Overdue RFIs", overdueNcrs: "Overdue NCRs", noHealth: "No project-health snapshot has been saved yet.", code: "Code", name: "Name", planned: "Planned value", start: "Planned start", finish: "Planned finish", addWbs: "Add WBS item", addActivity: "Schedule activity", activityLink: "Link WBS (optional)", noActivities: "No activities have been scheduled yet.", notStarted: "Not started", inProgress: "In progress", completed: "Completed", blocked: "Blocked", costCode: "Cost code", original: "Original budget", current: "Current budget", link: "Link WBS", projectLevel: "Project level", addBudget: "Record budget line", amount: "Amount", date: "Date", addCost: "Record actual cost", percent: "Percent complete", addProgress: "Record progress", pv: "PV planned value", ev: "EV earned value", ac: "AC actual cost", bac: "BAC at completion", save: "Save EVM snapshot", latest: "Latest snapshot", noSnapshot: "No EVM snapshot has been saved yet.", emptyWbs: "Add a WBS item first to link budgets, costs, and progress.", entries: "Recorded entries", noEntries: "No operational entries yet.", submitting: "Saving…", actual: "Actual", recorded: "Recorded", captureNote: "EVM snapshot values are entered manually in this batch. The interface does not claim they are calculated from operational records until the aggregation engine is complete.", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC", contractsAndDocuments: "Contracts, documents & claims", siteDelivery: "Site, quality & delivery", planningAndData: "Planning & controlled data", supportAndOversight: "Oversight, advisory & notifications",
      }, ur: {
        registry: "Project registry", level: "Level 3 · Project Delivery", loading: "Loading project controls…", project: "Project", title: "Project delivery board", subtitle: "Record operational data first, then save a traceable EVM snapshot.", wbs: "Work breakdown structure", activities: "Activities & schedule", budget: "Budget", cost: "Actual cost", progress: "Progress", snapshot: "EVM snapshot", health: "Project health", healthNote: "This snapshot uses the latest EVM, high-exposure risks, overdue actions, overdue RFIs, and overdue NCRs. Approval sources do not exist yet, so they enter as explicit zero values.", captureHealth: "Calculate and save health snapshot", healthPending: "Calculating health…", healthExceptions: "Health exceptions & recovery plans", score: "Score", confidence: "Confidence", highRisks: "High-exposure risks", overdueActions: "Overdue actions", overdueRfis: "Overdue RFIs", overdueNcrs: "Overdue NCRs", noHealth: "No project-health snapshot has been saved yet.", code: "Code", name: "Name", planned: "Planned value", start: "Planned start", finish: "Planned finish", addWbs: "Add WBS item", addActivity: "Schedule activity", activityLink: "Link WBS (optional)", noActivities: "No activities have been scheduled yet.", notStarted: "Not started", inProgress: "In progress", completed: "Completed", blocked: "Blocked", costCode: "Cost code", original: "Original budget", current: "Current budget", link: "Link WBS", projectLevel: "Project level", addBudget: "Record budget line", amount: "Amount", date: "Date", addCost: "Record actual cost", percent: "Percent complete", addProgress: "Record progress", pv: "PV planned value", ev: "EV earned value", ac: "AC actual cost", bac: "BAC at completion", save: "Save EVM snapshot", latest: "Latest snapshot", noSnapshot: "No EVM snapshot has been saved yet.", emptyWbs: "Add a WBS item first to link budgets, costs, and progress.", entries: "Recorded entries", noEntries: "No operational entries yet.", submitting: "Saving…", actual: "Actual", recorded: "Recorded", captureNote: "EVM snapshot values are entered manually in this batch. The interface does not claim they are calculated from operational records until the aggregation engine is complete.", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC", contractsAndDocuments: "Contracts, documents & claims", siteDelivery: "Site, quality & delivery", planningAndData: "Planning & controlled data", supportAndOversight: "Oversight, advisory & notifications",
      } });

  const manager = pickLanguage(language, { ar: { label: "مركز قيادة مدير المشروع", title: "إدارة المشروع من نقطة تشغيل واحدة", note: "تشمل هذه المساحة كل السجلات الواقعة في نطاق المشروع المصرح به. لا تمنح صلاحية على مشروع آخر أو على إدارة الشركة.", scope: "نطاق التشغيل", health: "صحة المشروع", evm: "أداء EVM", remaining: "الميزانية المتبقية", activities: "أنشطة مجدولة", blocked: "أنشطة متعثرة", schedule: "البرنامج والتكلفة", commercial: "العقود والمشتريات", field: "الموقع والجودة والموارد", assurance: "المستندات والبيانات والمتابعة", open: "فتح أدوات الإدارة", noSnapshot: "لا توجد لقطة", noData: "لا توجد بيانات" }, en: { label: "PROJECT MANAGER COMMAND CENTER", title: "Operate the project from one control point", note: "This workspace includes records inside the authorized project scope only. It grants no access to another project or tenant administration.", scope: "Operating scope", health: "Project health", evm: "EVM performance", remaining: "Remaining budget", activities: "Scheduled activities", blocked: "Blocked activities", schedule: "Schedule & cost", commercial: "Contracts & procurement", field: "Site, quality & resources", assurance: "Documents, data & oversight", open: "Open management tools", noSnapshot: "No snapshot", noData: "No data" }, ur: { label: "PROJECT MANAGER COMMAND CENTER", title: "Operate the project from one control point", note: "This workspace includes records inside the authorized project scope only. It grants no access to another project or tenant administration.", scope: "Operating scope", health: "Project health", evm: "EVM performance", remaining: "Remaining budget", activities: "Scheduled activities", blocked: "Blocked activities", schedule: "Schedule & cost", commercial: "Contracts & procurement", field: "Site, quality & resources", assurance: "Documents, data & oversight", open: "Open management tools", noSnapshot: "No snapshot", noData: "No data" } });

  const operational = pickLanguage(language, { ar: { title: "التقاط EVM محسوب", note: "تحسب PV من الأنشطة المجدولة حتى التاريخ المحدد، وEV من أحدث تقدم مُرسل لكل بند WBS، وAC من قيود التكلفة الفعلية المُرحّلة، وBAC من بنود الميزانية الحالية.", capture: "حساب وحفظ لقطة تشغيلية", sources: "مصادر اللقطة", activities: "أنشطة مجدولة", budgets: "بنود الميزانية", actualCosts: "قيود تكلفة فعلية", progress: "تقدم WBS", period: "تاريخ القطع" }, en: { title: "Calculated EVM capture", note: "PV is derived from scheduled activities through the selected date, EV from the latest submitted progress for each WBS item, AC from posted actual-cost entries, and BAC from current budget lines.", capture: "Calculate and save operational snapshot", sources: "Snapshot sources", activities: "Scheduled activities", budgets: "Budget lines", actualCosts: "Posted actual-cost entries", progress: "WBS progress", period: "Cut-off date" }, ur: { title: "Calculated EVM capture", note: "PV is derived from scheduled activities through the selected date, EV from the latest submitted progress for each WBS item, AC from posted actual-cost entries, and BAC from current budget lines.", capture: "Calculate and save operational snapshot", sources: "Snapshot sources", activities: "Scheduled activities", budgets: "Budget lines", actualCosts: "Posted actual-cost entries", progress: "WBS progress", period: "Cut-off date" } });

  if (scheduleQuery.error && financialsQuery.error && performanceQuery.error) return <PageMain className="p-2 text-destructive">{getLocalizedProjectError(scheduleQuery.error, isArabic)}</PageMain>;

  const fallbackData = { project: { code: projectId, name: t.title }, wbs: [], activities: [], budgets: [], costs: [], progress: [], latestEvm: null, latestHealth: null, cashFlow: null };
  const baseData = {
    ...fallbackData,
    project: scheduleQuery.data?.project ?? fallbackData.project,
    wbs: scheduleQuery.data?.wbs ?? financialsQuery.data?.wbs ?? fallbackData.wbs,
    activities: scheduleQuery.data?.activities ?? fallbackData.activities,
    budgets: financialsQuery.data?.budgets ?? fallbackData.budgets,
    costs: financialsQuery.data?.costs ?? fallbackData.costs,
    progress: financialsQuery.data?.progress ?? fallbackData.progress,
  };
  const latestHealth = performanceQuery.data?.latestHealth ?? null;
  const latestEvm = performanceQuery.data?.latestEvm ?? null;
  const cashFlow = performanceQuery.data?.cashFlow ?? null;
  const data = { ...baseData, latestHealth, latestEvm, cashFlow };
  const planningControl = calculatePlanningControl({
    activities: data.activities,
    boq: boqQuery.data ?? [],
    requisitions: procurementQuery.data?.requisitions ?? [],
    budgets: data.budgets,
    costs: data.costs,
    commitments: contractsQuery.data?.commitments ?? [],
    warehouseBalances: warehouseQuery.data?.balances ?? [],
  });
  const latestHealthExceptions = latestHealth ? parseStoredHealthExceptions(latestHealth.exceptions) : [];
  const latestHealthSources = latestHealth ? parseStoredHealthSources(latestHealth.drivers) : { overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 };
  const disabled = createWbs.isPending || createActivity.isPending || createBudget.isPending || createCost.isPending || createProgress.isPending || saveEvm.isPending || captureOperationalEvm.isPending || captureProjectHealth.isPending;
  const apiError = createWbs.error ?? createActivity.error ?? createBudget.error ?? createCost.error ?? createProgress.error ?? saveEvm.error ?? captureOperationalEvm.error ?? captureProjectHealth.error;
  const statusLabel = (status: string) => {
    const labels: Record<string, string> = { not_started: t.notStarted, in_progress: t.inProgress, completed: t.completed, blocked: t.blocked };
    return labels[status] ?? status;
  };
  const healthStatusLabel = (status: string) => ({ green: pickLanguage(language, { ar: "أخضر", en: "Green", ur: "سبز" }), amber: pickLanguage(language, { ar: "كهرماني", en: "Amber", ur: "نارنجی" }), red: pickLanguage(language, { ar: "أحمر", en: "Red", ur: "سرخ" }) }[status] ?? status);
  const healthConfidenceLabel = (confidence: string) => ({ low: pickLanguage(language, { ar: "منخفضة", en: "Low", ur: "کم" }), medium: pickLanguage(language, { ar: "متوسطة", en: "Medium", ur: "متوسط" }), high: pickLanguage(language, { ar: "مرتفعة", en: "High", ur: "زیادہ" }) }[confidence] ?? confidence);
  const dateLabel = (value: Date | string | null) => value ? formatDate(value, language) : "—";
  const sheet = pickLanguage(language, {
    ar: { open: "إدخال جدولي (لصق من Excel)", wbs: "جدول بنود هيكل تجزئة العمل", budget: "جدول بنود الميزانية", wbsCode: "رمز بند WBS (فارغ = المشروع)", unknownWbs: "لا بند WBS بهذا الرمز في المشروع" },
    en: { open: "Sheet entry (paste from Excel)", wbs: "WBS items sheet", budget: "Budget lines sheet", wbsCode: "WBS code (empty = the project)", unknownWbs: "No WBS item with this code in the project" },
    ur: { open: "جدولی اندراج (Excel سے پیسٹ کریں)", wbs: "WBS آئٹمز کی شیٹ", budget: "بجٹ کی مدوں کی شیٹ", wbsCode: "WBS کوڈ (خالی = پروجیکٹ)", unknownWbs: "پروجیکٹ میں اس کوڈ کا کوئی WBS آئٹم نہیں" },
  });
  const wbsIdByCode = new Map(data.wbs.map(item => [item.code.trim().toLowerCase(), item.id]));
  // a sheet row is saved by the same procedure as the one-row form; a refusal comes back in the person's language, on its row
  const saveRow = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { throw new Error(getLocalizedProjectError(error, language)); } };
  // Every upload and add button reaches a group that lives in the overview tab. From the PMC tab the page switches to the overview first and
  // jumps once it is drawn (#217); an add button then puts the focus on the group's first field, as "+ Add" does inside a section.
  const goToOverviewLane = (id: string, focusFirstField = false) => {
    const go = () => {
      jumpToManagerLane(id);
      if (focusFirstField) document.getElementById(id)?.querySelector<HTMLElement>('form input:not([type="hidden"]):not([disabled]), form textarea:not([disabled]), form [role="combobox"]:not([disabled])')?.focus();
    };
    if (view === "pmc") { setView("overview"); requestAnimationFrame(go); } else go();
  };
  // The page's one upload ("Upload any file", the start card, "Upload file" on a section): the smart-import screen once it has a route
  // (client/src/lib/uploadAnyFile.ts), the data-imports group until then.
  const openUpload = () => {
    const href = uploadAnyFileHref(tenantId, projectId);
    if (href) { navigate(href); return; }
    goToOverviewLane(UPLOAD_ANY_FILE_FALLBACK_GROUP);
  };
  const upload = canImport ? openUpload : undefined;
  const addSchedule = canWriteSchedule ? () => goToOverviewLane("manager-schedule", true) : undefined;
  const addRecords = canWriteRecords ? () => goToOverviewLane("manager-schedule", true) : undefined;
  // an empty section says what is missing and, when the person can act, what to do; "not in your access scope" is for a real refusal only
  const emptyText = pickLanguage(language, {
    ar: { schedule: "لم تُسجَّل جدولة بعد.", scheduleAct: "أضف نشاطًا أو ارفع البرنامج الزمني.", records: "لم تُسجَّل ميزانية ولا تكلفة ولا إنجاز بعد.", recordsAct: "أضف بندًا أو ارفع ملفًا.", performance: "لا توجد لقطة أداء بعد: تُحسب بعد تسجيل الجدولة والميزانية والإنجاز." },
    en: { schedule: "No schedule recorded yet.", scheduleAct: "Add an activity or upload the programme.", records: "No budget, cost or progress recorded yet.", recordsAct: "Add a line or upload a file.", performance: "No performance snapshot yet: it is calculated once the schedule, budget and progress are recorded." },
    ur: { schedule: "ابھی کوئی شیڈول درج نہیں ہوا۔", scheduleAct: "کوئی سرگرمی شامل کریں یا پروگرام اپ لوڈ کریں۔", records: "ابھی کوئی بجٹ، لاگت یا پیش رفت درج نہیں ہوئی۔", recordsAct: "کوئی سطر شامل کریں یا فائل اپ لوڈ کریں۔", performance: "ابھی کارکردگی کا کوئی اسنیپ شاٹ نہیں: یہ شیڈول، بجٹ اور پیش رفت درج ہونے کے بعد نکالا جاتا ہے۔" },
  });
  const jumpToManagerLane = (id: string) => { const target = document.getElementById(id); if (target instanceof HTMLDetailsElement) target.open = true; if (typeof target?.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <ProjectUploadContext.Provider value={upload ?? null}>
    <PageMain className="flex min-w-0 flex-col gap-5 text-foreground [&>*]:min-w-0">
        <DashboardSectionReporter tenantId={tenantId} projectId={projectId} product="PROJECT" sectionKey="project_schedule" state={scheduleQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} projectId={projectId} product="PROJECT" sectionKey="project_financials" state={financialsQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} projectId={projectId} product="PROJECT" sectionKey="project_performance" state={performanceQuery.error ? "error" : performanceQuery.data && (!latestEvm || !latestHealth) ? "partial" : null} />
        <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-64">
              <p dir="ltr" className="text-start text-xs font-semibold text-muted-foreground">{data.project.code}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl"><bdi>{data.project.name}</bdi></h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t.subtitle}</p>
            </div>
            {/* the smart-import screen (Agent 1); until it has a route, the page's own data-imports group (client/src/lib/uploadAnyFile.ts) */}
            {upload ? <button type="button" onClick={upload} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><FileUp className="h-4 w-4" aria-hidden="true" />{pickLanguage(language, { ar: "ارفع أي ملف", en: "Upload any file", ur: "کوئی بھی فائل اپ لوڈ کریں" })}</button> : null}
          </div>
          <PageHeader className="print:hidden">
          <nav aria-label={pickLanguage(language, { ar: "صفحات المشروع", en: "Project pages", ur: "پروجیکٹ کے صفحات" })} className="flex flex-wrap gap-2 print:hidden">
            {([["pmc", pickLanguage(language, { ar: "ضبط المشروع PMC", en: "Project control (PMC)", ur: "پروجیکٹ کنٹرول (PMC)" })], ["profitability", pickLanguage(language, { ar: "ربحية المشروع", en: "Profitability", ur: "منافع" })], ["commercial", pickLanguage(language, { ar: "السلسلة التجارية", en: "Commercial chain", ur: "کمرشل چین" })], ["guide", pickLanguage(language, { ar: "دليل الاستخدام", en: "User guide", ur: "صارف گائیڈ" })]] as const).map(([path, label]) => (
              <Link key={path} href={`/projects/${tenantId}/${projectId}/${path}`} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border border-input px-3 md:min-h-10 text-sm font-medium text-foreground hover:bg-muted">{label}</Link>
            ))}
          </nav>
          </PageHeader>
        </section>
        {scheduleQuery.data && financialsQuery.data ? <ProjectStart counts={{ activities: data.activities.length, budgets: data.budgets.length, progress: data.progress.length }} onUpload={upload} onManual={canWriteSchedule || canWriteRecords ? () => goToOverviewLane("manager-schedule", true) : undefined} /> : null}

        <nav role="tablist" aria-label={pickLanguage(language, { ar: "أقسام صفحة الضبط", en: "Controls page views", ur: "کنٹرول صفحے کے حصے" })} className="flex flex-wrap gap-2 print:hidden">
          {([["overview", pickLanguage(language, { ar: "نظرة عامة وأدوات الضبط", en: "Overview and control tools", ur: "جائزہ اور کنٹرول کے ٹولز" })], ["pmc", pickLanguage(language, { ar: "ضبط المشروع PMC", en: "PMC project control", ur: "PMC پروجیکٹ کنٹرول" })]] as const).map(([key, label]) => (
            <button key={key} id={`controls-tab-${key}`} role="tab" type="button" aria-selected={view === key} aria-controls={`controls-panel-${key}`} className={`min-h-11 rounded-[var(--radius)] border px-4 text-sm font-medium ${view === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted"}`} onClick={() => { setView(key); try { window.history.replaceState(null, "", key === "pmc" ? "#pmc" : window.location.pathname + window.location.search); } catch { /* the address bar is a convenience, not state */ } }}>{label}</button>
          ))}
        </nav>
        {view === "pmc" && <section id="controls-panel-pmc" role="tabpanel" aria-labelledby="controls-tab-pmc"><SectionErrorBoundary title={pickLanguage(language, { ar: "ضبط المشروع PMC", en: "PMC project control", ur: "PMC پروجیکٹ کنٹرول" })} isArabic={isArabic}><ProjectPmcWorkspace embedded /></SectionErrorBoundary></section>}
        <div id="controls-panel-overview" role={view === "overview" ? "tabpanel" : undefined} hidden={view === "pmc"} className="flex flex-col gap-5 [&>*]:min-w-0">

        <section aria-label={manager.label} className="rounded-[var(--radius)] border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold text-primary">{manager.label}</p><h2 className="mt-1 text-xl font-semibold">{manager.title}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{manager.note}</p></div><Badge variant="secondary">{manager.scope}: {data.project.code}</Badge></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ManagerMetric label={manager.health} value={latestHealth ? formatNumber(Number(latestHealth.overallScore)) : manager.noSnapshot} status={latestHealth ? { tone: latestHealth.status === "red" ? "danger" : latestHealth.status === "amber" ? "warning" : "success", label: healthStatusLabel(latestHealth.status) } : undefined} detail={latestHealth ? t.score : manager.noData} basis={indicatorBasisLine("health", language, latestHealth?.periodAt)} />
            <ManagerMetric label={manager.evm} value={latestEvm ? `${t.cpi} ${latestEvm.cpi == null ? "—" : formatNumber(Number(latestEvm.cpi), 2)} · ${t.spi} ${latestEvm.spi == null ? "—" : formatNumber(Number(latestEvm.spi), 2)}` : manager.noSnapshot} status={latestEvm?.cpi != null ? { tone: Number(latestEvm.cpi) >= 1 ? "success" : Number(latestEvm.cpi) >= 0.9 ? "warning" : "danger", label: Number(latestEvm.cpi) >= 1 ? pickLanguage(language, { ar: "ضمن الكلفة", en: "Within cost", ur: "لاگت کے اندر" }) : pickLanguage(language, { ar: "تجاوز الكلفة", en: "Over cost", ur: "لاگت سے زیادہ" }) } : undefined} detail={latestEvm ? `${t.eac}: ${formatNumber(Number(latestEvm.eac))}` : manager.noData} basis={indicatorBasisLine("evm", language, latestEvm?.periodAt)} />
            <ManagerMetric label={manager.remaining} value={cashFlow ? formatNumber(Number(cashFlow.remainingBudget)) : manager.noData} status={cashFlow ? (Number(cashFlow.remainingBudget) < 0 ? { tone: "danger", label: pickLanguage(language, { ar: "تجاوز الميزانية", en: "Over budget", ur: "بجٹ سے زیادہ" }) } : undefined) : undefined} detail={cashFlow ? `${pickLanguage(language, { ar: "الالتزامات", en: "Commitments", ur: "کمٹمنٹس" })}: ${formatNumber(Number(cashFlow.committedAmount))}` : ""} basis={indicatorBasisLine("remaining", language, null)} />
            <ManagerMetric label={manager.activities} value={formatNumber(data.activities.length)} status={data.activities.some(item => item.status === "blocked") ? { tone: "warning", label: `${manager.blocked}: ${formatNumber(data.activities.filter(item => item.status === "blocked").length)}` } : undefined} detail="" basis={indicatorBasisLine("activities", language, null)} />
            <ManagerMetric label={t.wbs} value={formatNumber(data.wbs.length)} detail={`${t.progress}: ${formatNumber(data.progress.length)}`} basis={indicatorBasisLine("wbs", language, null)} /></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><ManagerLane icon={CalendarDays} title={manager.schedule} detail={pickLanguage(language, { ar: "WBS، الأنشطة، الميزانية، التكلفة والتقدم", en: "WBS, activities, budget, actual cost and progress", ur: "WBS، سرگرمیاں، بجٹ، اصل لاگت اور پیش رفت" })} onClick={() => jumpToManagerLane("manager-schedule")} action={manager.open} /><ManagerLane icon={PackageCheck} title={manager.commercial} detail={pickLanguage(language, { ar: "العقود، طلبات المواد، أوامر الشراء والمطالبات", en: "Contracts, requisitions, purchase orders and claims", ur: "معاہدے، مادّوں کی درخواستیں، خریداری کے آرڈرز اور دعوے" })} onClick={() => jumpToManagerLane("manager-commercial")} action={manager.open} /><ManagerLane icon={ShieldCheck} title={manager.field} detail={pickLanguage(language, { ar: "التقارير الميدانية والجودة وHSE وRFI وNCR والموارد", en: "Field reports, quality, HSE, RFIs, NCRs and resources", ur: "فیلڈ رپورٹس، معیار، HSE، RFIs، NCRs اور وسائل" })} onClick={() => jumpToManagerLane("manager-site")} action={manager.open} /><ManagerLane icon={FileCheck2} title={manager.assurance} detail={pickLanguage(language, { ar: "المستندات وExcel والخطة الرئيسية والإشعارات والاستشارة", en: "Documents, Excel, Master Plan, notifications and advisory", ur: "دستاویزات، Excel، ماسٹر پلان، اطلاعات اور مشاورت" })} onClick={() => jumpToManagerLane("manager-assurance")} action={manager.open} /></div>
        </section>

        <div>
          <PlanningControlCenter result={planningControl} currency={String(("currency" in data.project ? data.project.currency : "SAR") ?? "SAR")} isLoading={boqQuery.isLoading || procurementQuery.isLoading || warehouseQuery.isLoading || contractsQuery.isLoading} />
        </div>

        {apiError && <p className="mt-5 rounded-xl bg-danger-soft p-4 text-sm text-danger-soft-foreground">{getLocalizedProjectError(apiError, isArabic)}</p>}
        {scheduleQuery.isLoading && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "الجدولة وWBS", en: "Schedule and WBS", ur: "شیڈول اور WBS" })} isArabic={isArabic} kind="loading" /></div>}
        {scheduleQuery.error && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "الجدولة وWBS", en: "Schedule and WBS", ur: "شیڈول اور WBS" })} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(scheduleQuery.error, isArabic)} onRetry={() => void scheduleQuery.refetch()} /></div>}
        {scheduleQuery.data && !data.wbs.length && !data.activities.length && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "الجدولة وWBS", en: "Schedule and WBS", ur: "شیڈول اور WBS" })} isArabic={isArabic} kind="empty" detail={addSchedule || upload ? `${emptyText.schedule} ${emptyText.scheduleAct}` : emptyText.schedule} actions={addSchedule || upload ? <SectionActions onAdd={addSchedule} /> : undefined} /></div>}
        {financialsQuery.isLoading && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "سجلات التكلفة والتقدم", en: "Cost and progress records", ur: "لاگت اور پیش رفت کے ریکارڈ" })} isArabic={isArabic} kind="loading" /></div>}
        {financialsQuery.error && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "سجلات التكلفة والتقدم", en: "Cost and progress records", ur: "لاگت اور پیش رفت کے ریکارڈ" })} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(financialsQuery.error, isArabic)} onRetry={() => void financialsQuery.refetch()} /></div>}
        {financialsQuery.data && !data.budgets.length && !data.costs.length && !data.progress.length && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "سجلات التكلفة والتقدم", en: "Cost and progress records", ur: "لاگت اور پیش رفت کے ریکارڈ" })} isArabic={isArabic} kind="empty" detail={addRecords || upload ? `${emptyText.records} ${emptyText.recordsAct}` : emptyText.records} actions={addRecords || upload ? <SectionActions onAdd={addRecords} /> : undefined} /></div>}
        {performanceQuery.isLoading && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "بيانات أداء المشروع", en: "Project performance data", ur: "پروجیکٹ کی کارکردگی کا ڈیٹا" })} isArabic={isArabic} kind="loading" /></div>}
        {performanceQuery.error && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "بيانات أداء المشروع", en: "Project performance data", ur: "پروجیکٹ کی کارکردگی کا ڈیٹا" })} isArabic={isArabic} kind="error" error={performanceQuery.error} onRetry={() => void performanceQuery.refetch()} /></div>}
        {performanceQuery.data && !latestEvm && !latestHealth && !cashFlow && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "بيانات أداء المشروع", en: "Project performance data", ur: "پروجیکٹ کی کارکردگی کا ڈیٹا" })} isArabic={isArabic} kind="empty" detail={emptyText.performance} /></div>}
        {performanceQuery.data && (latestEvm || latestHealth || cashFlow) && (!latestEvm || !latestHealth) && <div className="mt-5"><SectionMessage title={pickLanguage(language, { ar: "بيانات أداء المشروع", en: "Project performance data", ur: "پروجیکٹ کی کارکردگی کا ڈیٹا" })} isArabic={isArabic} kind="partial" detail={pickLanguage(language, { ar: `المتاح: ${cashFlow ? "التدفق النقدي" : "جزء من الأداء"}. الناقص: ${!latestEvm ? "لقطة EVM" : ""}${!latestEvm && !latestHealth ? " و" : ""}${!latestHealth ? "لقطة الصحة" : ""}.`, en: `Available: ${cashFlow ? "cash flow" : "part of the performance data"}. Missing: ${!latestEvm ? "EVM snapshot" : ""}${!latestEvm && !latestHealth ? " and " : ""}${!latestHealth ? "health snapshot" : ""}.`, ur: `دستیاب: ${cashFlow ? "نقد بہاؤ" : "کارکردگی کے ڈیٹا کا ایک حصہ"}۔ غائب: ${!latestEvm ? "EVM اسنیپ شاٹ" : ""}${!latestEvm && !latestHealth ? " اور " : ""}${!latestHealth ? "صحت کا اسنیپ شاٹ" : ""}۔` })} /></div>}

        {/* D-84: a grid item's minimum width is its content's, so a wide table inside a section (even inside its own scroller) pushed the whole column past a phone's width; min-w-0 lets the scroller scroll */}
        <div className="grid gap-6 [&>*]:min-w-0">
          <SectionErrorBoundary title={pickLanguage(language, { ar: "تحديث التخطيط والتكلفة", en: "Schedule & cost updates", ur: "شیڈول اور لاگت کی تازہ کاری" })} isArabic={isArabic}>
          <OperationsGroup id="manager-schedule" title={pickLanguage(language, { ar: "تحديث التخطيط والتكلفة", en: "Schedule & cost updates", ur: "شیڈول اور لاگت کی تازہ کاری" })}>
            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
              <SectionHeading icon={ClipboardList} title={t.wbs} detail={`${data.wbs.length} ${t.recorded}`} />
              <WriteGate permission={"project.wbs.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية إضافة بنود هيكل تجزئة العمل، فالشاشة للعرض فقط.", en: "You do not have permission to add WBS items; this view is read-only for you.", ur: "آپ کو WBS آئٹمز شامل کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 grid gap-3 md:grid-cols-[.7fr_1.2fr_.8fr_auto]" onSubmit={event => { event.preventDefault(); createWbs.mutate({ tenantId, projectId, code: wbs.code, name: wbs.name, plannedValue: Number(wbs.plannedValue || 0) }); setWbs({ code: "", name: "", plannedValue: "" }); }}>
                <Input aria-label={t.code} placeholder={t.code} value={wbs.code} onChange={event => setWbs({ ...wbs, code: event.target.value })} required />
                <Input aria-label={t.name} placeholder={t.name} value={wbs.name} onChange={event => setWbs({ ...wbs, name: event.target.value })} required />
                <Input aria-label={t.planned} placeholder={t.planned} type="number" min="0" value={wbs.plannedValue} onChange={event => setWbs({ ...wbs, plannedValue: event.target.value })} />
                <Button disabled={disabled}><Plus className="me-1 h-4 w-4" />{createWbs.isPending ? t.submitting : t.addWbs}</Button>
              </CheckedForm>
              <details className="group mt-4"><summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary">{sheet.open}</summary>
                <div className="mt-3"><GridEditor label={sheet.wbs} columns={[{ key: "code", label: t.code, required: true }, { key: "name", label: t.name, required: true, minLength: 2 }, { key: "plannedValue", label: t.planned, kind: "number", min: 0 }]}
                  onSaveRow={row => saveRow(() => sheetWbs.mutateAsync({ tenantId, projectId, code: row.code.trim(), name: row.name.trim(), ...(row.plannedValue.trim() ? { plannedValue: gridNumber(row.plannedValue) } : {}) }))} onSaved={refresh} /></div>
              </details></WriteGate>
              {data.wbs.length ? <div className="mt-5 divide-y rounded-xl border">{data.wbs.map(item => <div key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{item.code} · {item.name}</p><p className="mt-1 text-xs text-muted-foreground">{t.planned}: {item.plannedValue}</p></div><Badge variant="secondary">{item.progressPercent}%</Badge></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">{t.emptyWbs}</p>}
            </section>

            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
              <SectionHeading icon={CalendarDays} title={t.activities} detail={`${data.activities.length} ${t.recorded}`} />
              <WriteGate permission={"project.schedule.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية إضافة الأنشطة، فالشاشة للعرض فقط.", en: "You do not have permission to add activities; this view is read-only for you.", ur: "آپ کو سرگرمیاں شامل کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); createActivity.mutate({ tenantId, projectId, ...(activity.wbsItemId === "project" ? {} : { wbsItemId: activity.wbsItemId }), code: activity.code, name: activity.name, plannedValue: Number(activity.plannedValue || 0), plannedStartAt: new Date(`${activity.plannedStartAt}T00:00:00.000Z`), plannedFinishAt: new Date(`${activity.plannedFinishAt}T00:00:00.000Z`) }); setActivity({ wbsItemId: "project", code: "", name: "", plannedValue: "", plannedStartAt: today, plannedFinishAt: today }); }}>
                <Label className="md:col-span-2">{t.activityLink}<Select value={activity.wbsItemId} onValueChange={wbsItemId => setActivity({ ...activity, wbsItemId })}><SelectTrigger className="mt-1" aria-label={t.activityLink}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">{t.projectLevel}</SelectItem>{data.wbs.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></Label>
                <Input aria-label={t.code} placeholder={t.code} value={activity.code} onChange={event => setActivity({ ...activity, code: event.target.value })} required />
                <Input aria-label={t.name} placeholder={t.name} value={activity.name} onChange={event => setActivity({ ...activity, name: event.target.value })} required />
                <Input aria-label={t.planned} placeholder={t.planned} type="number" min="0" value={activity.plannedValue} onChange={event => setActivity({ ...activity, plannedValue: event.target.value })} />
                <Label>{t.start}<Input className="mt-1" aria-label={t.start} type="date" value={activity.plannedStartAt} onChange={event => setActivity({ ...activity, plannedStartAt: event.target.value })} required /></Label>
                <Label>{t.finish}<Input className="mt-1" aria-label={t.finish} type="date" min={activity.plannedStartAt} value={activity.plannedFinishAt} onChange={event => setActivity({ ...activity, plannedFinishAt: event.target.value })} required /></Label>
                <Button className="md:col-span-2" disabled={disabled}><Plus className="me-1 h-4 w-4" />{createActivity.isPending ? t.submitting : t.addActivity}</Button>
              </CheckedForm></WriteGate>
              {data.activities.length ? <div className="mt-5 divide-y rounded-xl border">{data.activities.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{item.code} · {item.name}</p><p className="mt-1 text-xs text-muted-foreground">{dateLabel(item.plannedStartAt)} — {dateLabel(item.plannedFinishAt)}</p></div><Badge variant="secondary">{statusLabel(item.status)}</Badge></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">{t.noActivities}</p>}
            </section>

            <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><SectionHeading icon={Banknote} title={t.budget} /><WriteGate permission={"project.budget.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية إدخال بنود الميزانية، فالشاشة للعرض فقط.", en: "You do not have permission to enter budget lines; this view is read-only for you.", ur: "آپ کو بجٹ کی سطریں درج کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createBudget.mutate({ tenantId, projectId, ...(budget.wbsItemId === "project" ? {} : { wbsItemId: budget.wbsItemId }), costCode: budget.costCode, originalAmount: Number(budget.originalAmount), currentAmount: Number(budget.currentAmount) }); setBudget({ wbsItemId: "project", costCode: "", originalAmount: "", currentAmount: "" }); }}><WbsSelect value={budget.wbsItemId} onChange={wbsItemId => setBudget({ ...budget, wbsItemId })} label={t.link} projectLabel={t.projectLevel} items={data.wbs} /><Input aria-label={t.costCode} placeholder={t.costCode} value={budget.costCode} onChange={event => setBudget({ ...budget, costCode: event.target.value })} required /><Input aria-label={t.original} placeholder={t.original} type="number" min="0" value={budget.originalAmount} onChange={event => setBudget({ ...budget, originalAmount: event.target.value })} required /><Input aria-label={t.current} placeholder={t.current} type="number" min="0" value={budget.currentAmount} onChange={event => setBudget({ ...budget, currentAmount: event.target.value })} required /><Button className="w-full" disabled={disabled}>{createBudget.isPending ? t.submitting : t.addBudget}</Button></CheckedForm>
                <details className="group mt-4"><summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary">{sheet.open}</summary>
                  <div className="mt-3"><GridEditor label={sheet.budget} columns={[{ key: "wbsCode", label: sheet.wbsCode }, { key: "costCode", label: t.costCode, required: true }, { key: "originalAmount", label: t.original, kind: "number", required: true, min: 0 }, { key: "currentAmount", label: t.current, kind: "number", required: true, min: 0 }]}
                    validateRow={row => (row.wbsCode.trim() && !wbsIdByCode.has(row.wbsCode.trim().toLowerCase()) ? `${sheet.wbsCode}: ${sheet.unknownWbs}` : null)}
                    onSaveRow={row => saveRow(() => sheetBudget.mutateAsync({ tenantId, projectId, ...(row.wbsCode.trim() ? { wbsItemId: wbsIdByCode.get(row.wbsCode.trim().toLowerCase())! } : {}), costCode: row.costCode.trim(), originalAmount: gridNumber(row.originalAmount), currentAmount: gridNumber(row.currentAmount) }))} onSaved={refresh} /></div>
                </details></WriteGate></section>
              <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><SectionHeading icon={Activity} title={t.cost} /><WriteGate permission={"project.cost.enter"} projectId={projectId} reason={{ ar: "لا تملك صلاحية تسجيل التكلفة الفعلية، فالشاشة للعرض فقط.", en: "You do not have permission to record actual cost; this view is read-only for you.", ur: "آپ کو اصل لاگت درج کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createCost.mutate({ tenantId, projectId, ...(cost.wbsItemId === "project" ? {} : { wbsItemId: cost.wbsItemId }), amount: Number(cost.amount), incurredAt: new Date(`${cost.incurredAt}T00:00:00.000Z`) }); setCost({ wbsItemId: "project", amount: "", incurredAt: today }); }}><WbsSelect value={cost.wbsItemId} onChange={wbsItemId => setCost({ ...cost, wbsItemId })} label={t.link} projectLabel={t.projectLevel} items={data.wbs} /><Input aria-label={t.amount} placeholder={t.amount} type="number" min="0.01" step="0.01" value={cost.amount} onChange={event => setCost({ ...cost, amount: event.target.value })} required /><Input aria-label={t.date} type="date" value={cost.incurredAt} onChange={event => setCost({ ...cost, incurredAt: event.target.value })} required /><Button className="w-full" disabled={disabled}>{createCost.isPending ? t.submitting : t.addCost}</Button></CheckedForm></WriteGate></section>
            </div>
          </OperationsGroup>
          </SectionErrorBoundary>

          <SectionErrorBoundary title={pickLanguage(language, { ar: "أداء المشروع والسجلات", en: "Project performance and records", ur: "پروجیکٹ کی کارکردگی اور ریکارڈ" })} isArabic={isArabic}>
          <aside className="space-y-6">
            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><SectionHeading icon={TrendingUp} title={t.progress} /><WriteGate permission={"project.progress.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية تسجيل الإنجاز، فالشاشة للعرض فقط.", en: "You do not have permission to report progress; this view is read-only for you.", ur: "آپ کو پیش رفت رپورٹ کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createProgress.mutate({ tenantId, projectId, wbsItemId: progress.wbsItemId, percentComplete: Number(progress.percentComplete), reportedAt: new Date(`${progress.reportedAt}T00:00:00.000Z`) }); setProgress({ wbsItemId: "", percentComplete: "", reportedAt: today }); }}><Select value={progress.wbsItemId} onValueChange={wbsItemId => setProgress({ ...progress, wbsItemId })} disabled={!data.wbs.length}><SelectTrigger aria-label={t.link}><SelectValue placeholder={t.link} /></SelectTrigger><SelectContent>{data.wbs.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select><Input aria-label={t.percent} placeholder={t.percent} type="number" min="0" max="100" value={progress.percentComplete} onChange={event => setProgress({ ...progress, percentComplete: event.target.value })} required /><Input aria-label={t.date} type="date" value={progress.reportedAt} onChange={event => setProgress({ ...progress, reportedAt: event.target.value })} required /><Button className="w-full" disabled={disabled || !progress.wbsItemId}>{createProgress.isPending ? t.submitting : t.addProgress}</Button></CheckedForm></WriteGate></section>
            <OperationsGroup id="manager-commercial" title={t.contractsAndDocuments}><ProjectContracts tenantId={tenantId} projectId={projectId} /><ProjectProcurement tenantId={tenantId} projectId={projectId} /><ProjectPurchaseOrders tenantId={tenantId} projectId={projectId} /><ProjectGoodsReceipts tenantId={tenantId} projectId={projectId} /><ProjectClaims tenantId={tenantId} projectId={projectId} /><ProjectDocuments tenantId={tenantId} projectId={projectId} /></OperationsGroup>
            <OperationsGroup id="manager-tenders" lazy title={pickLanguage(language, { ar: "المناقصات قبل الترسية", en: "Tenders before award", ur: "ایوارڈ سے پہلے کے ٹینڈرز" })}><ProjectTenders tenantId={tenantId} projectId={projectId} /></OperationsGroup>
            <OperationsGroup id="manager-design" lazy title={pickLanguage(language, { ar: "التنسيق الفني والمعماري", en: "Technical & architectural coordination", ur: "تکنیکی اور تعمیراتی ہم آہنگی" })}><ProjectDesign tenantId={tenantId} projectId={projectId} /></OperationsGroup>
            <OperationsGroup id="manager-site" title={t.siteDelivery}><ProjectFieldReports tenantId={tenantId} projectId={projectId} /><ProjectQualityInspections tenantId={tenantId} projectId={projectId} /><ProjectHse tenantId={tenantId} projectId={projectId} /><ProjectRfis tenantId={tenantId} projectId={projectId} /><ProjectNcrs tenantId={tenantId} projectId={projectId} /><ProjectChanges tenantId={tenantId} projectId={projectId} /><ProjectResources tenantId={tenantId} projectId={projectId} /><ProjectWorkforce tenantId={tenantId} projectId={projectId} /><ProjectMaterials tenantId={tenantId} projectId={projectId} /><ProjectWarehouses tenantId={tenantId} projectId={projectId} /></OperationsGroup>
            <OperationsGroup id="manager-assurance" title={t.planningAndData}><ProjectImports tenantId={tenantId} projectId={projectId} /><ProjectOperationalImports tenantId={tenantId} projectId={projectId} /><ProjectDataExport tenantId={tenantId} projectId={projectId} /><ProjectMasterPlan tenantId={tenantId} projectId={projectId} /><MasterPlanDrawing tenantId={tenantId} projectId={projectId} /></OperationsGroup>
            <OperationsGroup id="manager-oversight" title={t.supportAndOversight}><ProjectAdvisor tenantId={tenantId} projectId={projectId} /><ProjectNotifications tenantId={tenantId} /></OperationsGroup>
            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><SectionHeading icon={HeartPulse} title={t.health} /><p className="mt-4 text-xs leading-5 text-muted-foreground">{t.healthNote}</p><WriteGate permission={["project.evm.manage", "project.manage"]} projectId={projectId}><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"><Label className="grid gap-1">{operational.period}<Input className="w-full" aria-label={t.health} type="date" value={healthPeriod} onChange={event => setHealthPeriod(event.target.value)} required /></Label><Button disabled={disabled} onClick={() => captureProjectHealth.mutate({ tenantId, projectId, periodAt: new Date(`${healthPeriod}T00:00:00.000Z`) })}>{captureProjectHealth.isPending ? t.healthPending : t.captureHealth}</Button></div></WriteGate>{captureProjectHealth.data ? <div className="mt-4 rounded-xl border border-border bg-muted p-3 text-xs text-foreground"><p>{t.score}: {captureProjectHealth.data.score} · {healthStatusLabel(captureProjectHealth.data.status)} · {t.confidence}: {healthConfidenceLabel(captureProjectHealth.data.confidence)}</p><p className="mt-1">{t.highRisks}: {captureProjectHealth.data.sources.highRiskCount} · {t.overdueActions}: {captureProjectHealth.data.sources.overdueActionCount} · {t.overdueRfis}: {captureProjectHealth.data.sources.overdueRfiCount} · {t.overdueNcrs}: {captureProjectHealth.data.sources.overdueNcrCount}</p></div> : data.latestHealth ? <div className="mt-4 rounded-xl border border-border bg-muted p-3 text-xs text-foreground"><p>{t.latest}: {t.score} {data.latestHealth.overallScore} · {healthStatusLabel(data.latestHealth.status)} · {t.confidence}: {healthConfidenceLabel(data.latestHealth.confidence)}</p><p className="mt-1">{t.overdueRfis}: {latestHealthSources.overdueRfiCount} · {t.overdueNcrs}: {latestHealthSources.overdueNcrCount}</p><p className="mt-1">{pickLanguage(language, { ar: "ملاحظات HSE متأخرة", en: "Overdue HSE observations", ur: "مدت گزر چکے HSE مشاہدات" })}: {latestHealthSources.overdueHseCount}</p></div> : <p className="mt-4 text-sm text-muted-foreground">{t.noHealth}</p>}{latestHealthExceptions.length ? <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-muted-foreground">{t.healthExceptions}</p>{latestHealthExceptions.map((item, index) => { const exception = localizedHealthException(item, isArabic); return <div key={`${item.code}-${index}`} className={exception.severity === "critical" ? "rounded-lg bg-danger-soft p-3 text-xs text-danger-soft-foreground" : "rounded-lg bg-warning-soft p-3 text-xs text-warning-soft-foreground"}><p className="font-semibold">{exception.message}</p><p className="mt-1">{exception.recommendation}</p></div>; })}</div> : null}</section>
            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
              <SectionHeading icon={Calculator} title={t.snapshot} />
              <WriteGate permission={"project.evm.manage"} projectId={projectId}><div className="mt-5 rounded-xl border border-border bg-muted p-4">
                <h3 className="text-sm font-semibold text-foreground">{operational.title}</h3>
                <p className="mt-2 text-xs leading-5 text-foreground">{operational.note}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"><Label className="grid gap-1">{operational.period}<Input className="w-full" type="date" value={operationalPeriod} onChange={event => setOperationalPeriod(event.target.value)} required /></Label><Button disabled={disabled} onClick={() => captureOperationalEvm.mutate({ tenantId, projectId, periodAt: new Date(`${operationalPeriod}T00:00:00.000Z`), eacMethod: "ac_plus_remaining" })}>{captureOperationalEvm.isPending ? t.submitting : operational.capture}</Button></div>
                {captureOperationalEvm.data && <div className="mt-3 text-xs text-foreground"><p className="font-semibold">{operational.sources}</p><p>{operational.activities}: {captureOperationalEvm.data.sources.scheduledActivities} · {operational.budgets}: {captureOperationalEvm.data.sources.budgetLines}</p><p>{operational.actualCosts}: {captureOperationalEvm.data.sources.postedActualCostEntries} · {operational.progress}: {captureOperationalEvm.data.sources.wbsItemsWithProgress}</p></div>}
              </div></WriteGate>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">{t.captureNote}</p>
              <WriteGate permission={"project.evm.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية حفظ لقطات القيمة المكتسبة، فالشاشة للعرض فقط.", en: "You do not have permission to save earned-value snapshots; this view is read-only for you.", ur: "آپ کو اکتسابی قدر کے اسنیپ شاٹس محفوظ کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-5 grid grid-cols-2 gap-3" onSubmit={event => { event.preventDefault(); saveEvm.mutate({ tenantId, projectId, periodAt: new Date(`${evm.periodAt}T00:00:00.000Z`), pv: Number(evm.pv), ev: Number(evm.ev), ac: Number(evm.ac), bac: Number(evm.bac), eacMethod: evm.eacMethod }); }}><Input className="col-span-2" aria-label={t.date} type="date" value={evm.periodAt} onChange={event => setEvm({ ...evm, periodAt: event.target.value })} required /><Input aria-label={t.pv} placeholder={t.pv} type="number" min="0" value={evm.pv} onChange={event => setEvm({ ...evm, pv: event.target.value })} required /><Input aria-label={t.ev} placeholder={t.ev} type="number" min="0" value={evm.ev} onChange={event => setEvm({ ...evm, ev: event.target.value })} required /><Input aria-label={t.ac} placeholder={t.ac} type="number" min="0" value={evm.ac} onChange={event => setEvm({ ...evm, ac: event.target.value })} required /><Input aria-label={t.bac} placeholder={t.bac} type="number" min="0" value={evm.bac} onChange={event => setEvm({ ...evm, bac: event.target.value })} required /><Button className="col-span-2" disabled={disabled}>{saveEvm.isPending ? t.submitting : t.save}</Button></CheckedForm></WriteGate>{data.latestEvm ? <div className="mt-5 rounded-xl border border-border bg-muted p-4 text-sm text-foreground"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />{t.latest}</div><div className="mt-3 grid grid-cols-4 gap-2 text-xs"><span>{t.cpi}: {data.latestEvm.cpi ?? "—"}</span><span>{t.spi}: {data.latestEvm.spi ?? "—"}</span><span>{t.eac}: {data.latestEvm.eac}</span><span>{t.vac}: {data.latestEvm.vac}</span></div></div> : <p className="mt-4 text-sm text-muted-foreground">{t.noSnapshot}</p>}{data.cashFlow && <div className="mt-4 rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground"><p className="font-semibold">{pickLanguage(language, { ar: "ملخص التدفق النقدي التشغيلي", en: "Operational cash-flow summary", ur: "آپریشنل کیش فلو کا خلاصہ" })}</p><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{pickLanguage(language, { ar: "الميزانية المخططة", en: "Planned budget", ur: "منصوبہ بند بجٹ" })}: {data.cashFlow.plannedBudget}</span><span>{pickLanguage(language, { ar: "التكلفة الفعلية", en: "Actual cost", ur: "اصل لاگت" })}: {data.cashFlow.actualCost}</span><span>{pickLanguage(language, { ar: "الالتزامات", en: "Commitments", ur: "کمٹمنٹس" })}: {data.cashFlow.committedAmount}</span><span>{pickLanguage(language, { ar: "المتبقي", en: "Remaining budget", ur: "باقی بجٹ" })}: {data.cashFlow.remainingBudget}</span></div></div>}</section>
            <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><h2 className="font-semibold">{t.entries}</h2>{data.costs.length || data.progress.length || data.budgets.length ? <div className="mt-4 space-y-2 text-sm">{data.costs.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-muted p-3">{t.actual}: {entry.amount} · {enumLabel(entry.status, language)}</p>)}{data.progress.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-muted p-3">{t.progress}: {entry.progressPercent}% · {enumLabel(entry.status, language)}</p>)}{data.budgets.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-muted p-3">{entry.costCode}: {entry.currentAmount}</p>)}</div> : <p className="mt-4 text-sm text-muted-foreground">{t.noEntries}</p>}</section>
          </aside>
          </SectionErrorBoundary>
        </div>
        </div>
    </PageMain>
    </ProjectUploadContext.Provider>
  );
}

function SectionHeading({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail?: string }) {
  return <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" /></span><div><h2 className="font-semibold">{title}</h2>{detail && <p className="text-sm text-muted-foreground">{detail}</p>}</div></div>;
}

function WbsSelect({ value, onChange, label, projectLabel, items }: { value: string; onChange: (value: string) => void; label: string; projectLabel: string; items: Array<{ id: string; code: string; name: string }> }) {
  return <><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">{projectLabel}</SelectItem>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></>;
}

function ManagerMetric({ label, value, status, detail, basis }: { label: string; value: string; status?: { tone: "success" | "warning" | "danger"; label: string }; detail: string; basis?: string }) {
  // the number and its status on the face; the formula, source and date behind "How is it calculated?" (work order 21)
  return <MetricCard label={label} value={value} status={status} detail={detail || undefined} how={basis ? <p data-testid="indicator-basis">{basis}</p> : undefined} />;
}

function ManagerLane({ icon: Icon, title, detail, action, onClick }: { icon: typeof CalendarDays; title: string; detail: string; action: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><Icon className="h-5 w-5" /></span><span className="text-xs font-semibold text-primary">{action}</span></span><span className="mt-4 block font-semibold text-foreground">{title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></button>;
}

function OperationsGroup({ id, title, children, defaultOpen = false, lazy = false }: { id?: string; title: string; children: React.ReactNode; defaultOpen?: boolean; lazy?: boolean }) {
  // `lazy`: the children are mounted (and so ask the server for their data) only once the group has been opened, so a rarely used section costs the page nothing.
  const [opened, setOpened] = React.useState(false);
  // A link such as /controls#manager-commercial (from a cost line's source document, or from a Master Plan entity) opens the section it names,
  // on arrival and also when the hash changes while the page is already open.
  const [hash, setHash] = React.useState(typeof window === "undefined" ? "" : window.location.hash);
  React.useEffect(() => { const onChange = () => setHash(window.location.hash); window.addEventListener("hashchange", onChange); return () => window.removeEventListener("hashchange", onChange); }, []);
  const linked = Boolean(id) && hash === `#${id}`;
  React.useEffect(() => { if (linked && id) document.getElementById(id)?.scrollIntoView?.({ block: "start" }); }, [linked, id]);
  return <details id={id} className="scroll-mt-5 rounded-[var(--radius-lg)] border border-border bg-card shadow-sm" open={defaultOpen || linked} onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) setOpened(true); }}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-foreground marker:content-none"><span>{title}</span><span className="text-xs font-medium text-primary">+</span></summary><div className="space-y-5 border-t border-border p-4 sm:p-5">{!lazy || opened || defaultOpen || linked ? children : null}</div></details>;
}
