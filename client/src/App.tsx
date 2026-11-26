import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { LanguageAccountSync } from "./contexts/LanguageAccountSync";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import RequireAuth from "./components/RequireAuth";
import { ContentSkeleton } from "./components/ShellSkeleton";
import { PageGate, PermissionProvider } from "./lib/permissions";
import { IMPORT_HUB_READERS, REPORTS_HUB_READERS, SITE_HUB_READERS, type PageKey } from "@shared/pageAccess";
import { RouteBoundary } from "./components/RouteBoundary";
import { ProductShell, isFramedPath } from "./components/ProductShell";
import { Suspense, lazy, type ComponentType } from "react";
import { Route, Switch, useLocation, useParams } from "wouter";

// The design preview (work order 19) is its own chunk: the fonts and the component library it loads are not part of the main bundle.
const DesignPreview = lazy(() => import("./pages/DesignPreview"));
const DesignPreviewFrame = lazy(() => import("./pages/DesignPreviewFrame"));
// Q-18: every page but the first ones (home, sign-in, not found) is its own chunk, fetched when it is opened, so the first visit downloads the frame and
// one page instead of all of them. While a page's chunk is on its way, a grey placeholder with the page's shape (never a blank or green screen).
const lazyPage = (Page: ComponentType<any>) => function LazyRoute(props: any) { return <Suspense fallback={<ContentSkeleton />}><Page {...props} /></Suspense>; };
const EvmCalculator = lazyPage(lazy(() => import("./pages/EvmCalculator")));
const ExecutiveDashboard = lazyPage(lazy(() => import("./pages/ExecutiveDashboard")));
const ProjectControls = lazyPage(lazy(() => import("./pages/ProjectControls")));
const MyPerformance = lazyPage(lazy(() => import("./pages/MyPerformance")));
const MyWork = lazyPage(lazy(() => import("./pages/MyWork")));
const Operations = lazyPage(lazy(() => import("./pages/Operations")));
const Strategy = lazyPage(lazy(() => import("./pages/Strategy")));
const ProjectRegistry = lazyPage(lazy(() => import("./pages/ProjectRegistry")));
const SetupWizard = lazyPage(lazy(() => import("./pages/SetupWizard")));
const MyCompanies = lazyPage(lazy(() => import("./pages/MyCompanies")));
const ProjectTeam = lazyPage(lazy(() => import("./pages/ProjectTeam")));
const ProjectSetupWizard = lazyPage(lazy(() => import("./pages/ProjectSetupWizard")));
const DevPlanner = lazyPage(lazy(() => import("./pages/DevPlanner")));
const UserGuide = lazyPage(lazy(() => import("./pages/UserGuide")));
const PmoDashboard = lazyPage(lazy(() => import("./pages/PmoDashboard")));
const TenantAdministration = lazyPage(lazy(() => import("./pages/TenantAdministration")));
const AcceptInvitation = lazyPage(lazy(() => import("./pages/AcceptInvitation")));
const LicensingConsole = lazyPage(lazy(() => import("./pages/LicensingConsole")));
const PlatformAdmin = lazyPage(lazy(() => import("./pages/PlatformAdmin")));
const BillingRegister = lazyPage(lazy(() => import("./pages/BillingRegister")));
const SupportCenter = lazyPage(lazy(() => import("./pages/SupportCenter")));
const EmployeeRegistry = lazyPage(lazy(() => import("./pages/EmployeeRegistry")));
const PayrollWorkspace = lazyPage(lazy(() => import("./pages/PayrollWorkspace")));
const CommercialChain = lazyPage(lazy(() => import("./pages/CommercialChain")));
const ProjectProfitability = lazyPage(lazy(() => import("./pages/ProjectProfitability")));
const FieldEntry = lazyPage(lazy(() => import("./pages/FieldEntry")));
const QuickIssue = lazyPage(lazy(() => import("./pages/QuickIssue")));
const WorkConfirmation = lazyPage(lazy(() => import("./pages/WorkConfirmation")));
const ProjectPmc = lazyPage(lazy(() => import("./pages/ProjectPmc")));
const ProjectBaseline = lazyPage(lazy(() => import("./pages/ProjectBaseline")));
const PmcSiteConsultant = lazyPage(lazy(() => import("./pages/PmcSiteConsultant")));
const PmcSiteUpdate = lazyPage(lazy(() => import("./pages/PmcSiteUpdate")));
const PmcProgressUpdate = lazyPage(lazy(() => import("./pages/PmcProgressUpdate")));
const PmcQcReceipt = lazyPage(lazy(() => import("./pages/PmcQcReceipt")));
const StalledUnits = lazyPage(lazy(() => import("./pages/StalledUnits")));
const CompletionReport = lazyPage(lazy(() => import("./pages/CompletionReport")));
const ProjectMeetings = lazyPage(lazy(() => import("./pages/ProjectMeetings")));
const ProjectRisks = lazyPage(lazy(() => import("./pages/ProjectRisks")));
const ProjectSafety = lazyPage(lazy(() => import("./pages/ProjectSafety")));
const ProjectSite = lazyPage(lazy(() => import("./pages/ProjectSite")));
const ProjectReports = lazyPage(lazy(() => import("./pages/ProjectReports")));
const ProjectImportHub = lazyPage(lazy(() => import("./pages/ProjectImportHub")));
const ProjectImportKind = lazyPage(lazy(() => import("./pages/ProjectImportKind")));
const LiveSchedule = lazyPage(lazy(() => import("./pages/LiveSchedule")));
const LevelEntry = lazyPage(lazy(() => import("./pages/LevelEntry")));
const LevelCompany = lazyPage(lazy(() => import("./pages/LevelCompany")));
const LevelPortfolio = lazyPage(lazy(() => import("./pages/LevelPortfolio")));
const LevelProject = lazyPage(lazy(() => import("./pages/LevelProject")));
const LevelWarehouse = lazyPage(lazy(() => import("./pages/LevelWarehouse")));
const UserProfile = lazyPage(lazy(() => import("./pages/UserProfile")));
const SiteDailyReport = lazyPage(lazy(() => import("./pages/SiteDailyReport")));
const ProjectSubmittals = lazyPage(lazy(() => import("./pages/ProjectSubmittals")));
const WeeklyReport = lazyPage(lazy(() => import("./pages/WeeklyReport")));
const MonthlyReport = lazyPage(lazy(() => import("./pages/MonthlyReport")));
const ProjectQuality = lazyPage(lazy(() => import("./pages/ProjectQuality")));
const UnitCard = lazyPage(lazy(() => import("./pages/UnitCard")));
const IntegrationSettings = lazyPage(lazy(() => import("./pages/IntegrationSettings")));

function withAuth(Component: ComponentType<any>) {
  return function AuthenticatedRoute(props: any) {
    const [location] = useLocation();
    // every company route carries :tenantId; the provider asks the server once what this person may do there (client/src/lib/permissions.tsx)
    // the company routes sit in the one product frame, except the phone screens and the setup wizard (isFramedPath)
    return <RequireAuth><PermissionProvider tenantId={props.params?.tenantId}><RouteBoundary>{props.params?.tenantId && isFramedPath(location) ? <ProductShell tenantId={props.params.tenantId} projectId={props.params?.projectId}><Component {...props} /></ProductShell> : <Component {...props} />}</RouteBoundary></PermissionProvider></RequireAuth>;
  };
}

const ProtectedDesignPreview = withAuth(lazyPage(DesignPreview));
const ProtectedDesignFrame = withAuth(lazyPage(DesignPreviewFrame));
const ProtectedProfile = withAuth(UserProfile);
const ProtectedEvm = withAuth(EvmCalculator);
const ProtectedExecutive = withAuth(ExecutiveDashboard);
const ProtectedPmo = withAuth(PmoDashboard);
const ProtectedLicensing = withAuth(LicensingConsole);
const ProtectedPlatform = withAuth(PlatformAdmin);
const ProtectedBilling = withAuth(BillingRegister);
const ProtectedSupport = withAuth(SupportCenter);
const ProtectedPeople = withAuth(EmployeeRegistry);
const ProtectedPayroll = withAuth(PayrollWorkspace);
const ProtectedAdministration = withAuth(TenantAdministration);
const ProtectedMyPerformance = withAuth(MyPerformance);
const ProtectedMyWork = withAuth(MyWork);
const ProtectedOperations = withAuth(Operations);
const ProtectedStrategy = withAuth(Strategy);
// D-20 (G-160/G-161): a project page opened by its address without what its server read needs shows the translated «no permission» page (PageGate)
// Q-33: every page of shared/pageAccess.ts, not only six — the controls page, the field entry and its quality, progress and QC screens included
function gatedPage<P extends object>(Page: React.ComponentType<P>, page: PageKey) {
  return function GatedPage(props: P) {
    const { projectId } = useParams<{ projectId: string }>();
    return <PageGate page={page} projectId={projectId}><Page {...props} /></PageGate>;
  };
}
const ProtectedControls = withAuth(gatedPage(ProjectControls, "controls"));
// Q-56 (1): one kind of import on its own page, behind the same gate as the board group it came from
const ProtectedImportKind = withAuth(gatedPage(ProjectImportKind, "controls"));
// Q-56 (2): the two levels of the menu that live on the board open as pages of their own, behind the board's own gate
const ProtectedPlanning = withAuth(gatedPage(function PlanningPage() { return <ProjectControls focus="planning" />; }, "controls"));
const ProtectedSupply = withAuth(gatedPage(function SupplyPage() { return <ProjectControls focus="supply" />; }, "controls"));
// Q-59 (2): the site's records and the contracts, the two levels that were only on the board, each a page of its own
const ProtectedFieldRecords = withAuth(gatedPage(function FieldRecordsPage() { return <ProjectControls focus="site" />; }, "controls"));
const ProtectedContracts = withAuth(gatedPage(function ContractsPage() { return <ProjectControls focus="contracts" />; }, "controls"));
const ProtectedCommercial = withAuth(gatedPage(CommercialChain, "commercial"));
const ProtectedProfitability = withAuth(gatedPage(ProjectProfitability, "profitability"));
const ProtectedFieldEntry = withAuth(gatedPage(FieldEntry, "fieldEntry"));
const ProtectedQuickIssue = withAuth(QuickIssue);
const ProtectedWorkConfirmation = withAuth(WorkConfirmation);
const ProtectedPmc = withAuth(gatedPage(ProjectPmc, "pmc"));
const ProtectedBaseline = withAuth(gatedPage(ProjectBaseline, "baseline"));
const ProtectedSiteConsultant = withAuth(gatedPage(PmcSiteConsultant, "siteConsultant"));
const ProtectedSiteUpdate = withAuth(gatedPage(PmcSiteUpdate, "siteUpdate"));
const ProtectedProgressUpdate = withAuth(gatedPage(PmcProgressUpdate, "progress"));
const ProtectedQcReceipt = withAuth(gatedPage(PmcQcReceipt, "qc"));
const ProtectedStalledUnits = withAuth(gatedPage(StalledUnits, "stalled"));
const ProtectedCompletionReport = withAuth(gatedPage(CompletionReport, "completionReport"));
const ProtectedProjectMeetings = withAuth(gatedPage(ProjectMeetings, "meetings"));
const ProtectedProjectRisks = withAuth(gatedPage(ProjectRisks, "risks"));
const ProtectedProjectSafety = withAuth(gatedPage(ProjectSafety, "safety"));
// Q-36 (2 b): the site's entry page opens for whoever may open one of its four pages; each card has its own gate (shared/pageAccess.ts SITE_HUB_PAGES)
function SiteHubGate() { const { projectId } = useParams<{ projectId: string }>(); return <PageGate permission={SITE_HUB_READERS} projectId={projectId}><ProjectSite /></PageGate>; }
const ProtectedSite = withAuth(SiteHubGate);
// Q-36 (2 c): the reports' entry page, the same way (shared/pageAccess.ts REPORTS_HUB_PAGES)
function ReportsHubGate() { const { projectId } = useParams<{ projectId: string }>(); return <PageGate permission={REPORTS_HUB_READERS} projectId={projectId}><ProjectReports /></PageGate>; }
const ProtectedReports = withAuth(ReportsHubGate);
// Q-36 (3 c): one entry for every import, the same way (shared/pageAccess.ts IMPORT_HUB_PAGES)
function ImportHubGate() { const { projectId } = useParams<{ projectId: string }>(); return <PageGate permission={IMPORT_HUB_READERS} projectId={projectId}><ProjectImportHub /></PageGate>; }
const ProtectedImportHub = withAuth(ImportHubGate);
const ProtectedLiveSchedule = withAuth(gatedPage(LiveSchedule, "schedule"));
const ProtectedProjects = withAuth(ProjectRegistry); // the registry shows its own «no permission» card (ProjectRegistry: ErrorState); its links are gated (registry)
const ProtectedSetup = withAuth(SetupWizard);
const ProtectedMyCompanies = withAuth(MyCompanies);
const ProtectedTeam = withAuth(gatedPage(ProjectTeam, "team"));
const ProtectedSetupWizard = withAuth(ProjectSetupWizard);
const ProtectedPlanner = withAuth(DevPlanner);
const ProtectedGuide = withAuth(UserGuide);
const ProtectedLevelEntry = withAuth(LevelEntry);
const ProtectedLevelCompany = withAuth(LevelCompany);
const ProtectedLevelPortfolio = withAuth(LevelPortfolio);
const ProtectedLevelProject = withAuth(LevelProject);
const ProtectedLevelWarehouse = withAuth(LevelWarehouse);
const ProtectedSiteReport = withAuth(SiteDailyReport);
const ProtectedSubmittals = withAuth(ProjectSubmittals);
const ProtectedWeeklyReport = withAuth(gatedPage(WeeklyReport, "weeklyReport"));
const ProtectedMonthlyReport = withAuth(gatedPage(MonthlyReport, "monthlyReport"));
const ProtectedQuality = withAuth(gatedPage(ProjectQuality, "quality"));
const ProtectedUnitCard = withAuth(UnitCard);
const ProtectedIntegrations = withAuth(IntegrationSettings);

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/design-preview/frame/:direction/:screen" component={ProtectedDesignFrame} /><Route path="/design-preview" component={ProtectedDesignPreview} /><Route path="/profile" component={ProtectedProfile} /><Route path="/evm" component={ProtectedEvm} /><Route path="/invite/accept" component={AcceptInvitation} /><Route path="/companies" component={ProtectedMyCompanies} /><Route path="/companies/:tenantId" component={ProtectedMyCompanies} /><Route path="/setup" component={ProtectedSetup} /><Route path="/setup/:tenantId" component={ProtectedSetup} /><Route path="/levels/:tenantId" component={ProtectedLevelEntry} /><Route path="/levels/:tenantId/company" component={ProtectedLevelCompany} /><Route path="/levels/:tenantId/portfolio" component={ProtectedLevelPortfolio} /><Route path="/levels/:tenantId/projects/:projectId" component={ProtectedLevelProject} /><Route path="/levels/:tenantId/projects/:projectId/warehouse" component={ProtectedLevelWarehouse} /><Route path="/my-work/:tenantId" component={ProtectedMyWork} /><Route path="/operations/:tenantId" component={ProtectedOperations} /><Route path="/strategy/:tenantId" component={ProtectedStrategy} /><Route path="/executive/:tenantId" component={ProtectedExecutive} /><Route path="/pmo/:tenantId" component={ProtectedPmo} /><Route path="/platform" component={ProtectedPlatform} /><Route path="/licensing/:tenantId" component={ProtectedLicensing} /><Route path="/billing/:tenantId" component={ProtectedBilling} /><Route path="/support/:tenantId" component={ProtectedSupport} /><Route path="/people/:tenantId" component={ProtectedPeople} /><Route path="/payroll/:tenantId" component={ProtectedPayroll} /><Route path="/tenants/:tenantId/administration" component={ProtectedAdministration} /><Route path="/projects/:tenantId/:projectId/my-performance" component={ProtectedMyPerformance} /><Route path="/projects/:tenantId/:projectId/controls" component={ProtectedControls} /><Route path="/projects/:tenantId/:projectId/planning" component={ProtectedPlanning} /><Route path="/projects/:tenantId/:projectId/supply" component={ProtectedSupply} /><Route path="/projects/:tenantId/:projectId/field-records" component={ProtectedFieldRecords} /><Route path="/projects/:tenantId/:projectId/contracts" component={ProtectedContracts} /><Route path="/projects/:tenantId/:projectId/commercial" component={ProtectedCommercial} /><Route path="/projects/:tenantId/:projectId/profitability" component={ProtectedProfitability} /><Route path="/m/:tenantId/:projectId/issue" component={ProtectedQuickIssue} /><Route path="/m/:tenantId/:projectId/work-confirmation" component={ProtectedWorkConfirmation} /><Route path="/m/:tenantId/:projectId/report" component={ProtectedSiteReport} /><Route path="/m/:tenantId/:projectId/site-update" component={ProtectedSiteUpdate} /><Route path="/m/:tenantId/:projectId/progress" component={ProtectedProgressUpdate} /><Route path="/m/:tenantId/:projectId/qc" component={ProtectedQcReceipt} /><Route path="/m/:tenantId/:projectId/unit/:unitNumber" component={ProtectedUnitCard} /><Route path="/projects/:tenantId/:projectId/submittals" component={ProtectedSubmittals} /><Route path="/projects/:tenantId/:projectId/quality" component={ProtectedQuality} /><Route path="/integrations/:tenantId" component={ProtectedIntegrations} /><Route path="/m/:tenantId/:projectId" component={ProtectedFieldEntry} /><Route path="/projects/:tenantId/:projectId/site-consultant" component={ProtectedSiteConsultant} /><Route path="/projects/:tenantId/:projectId/pmc" component={ProtectedPmc} /><Route path="/projects/:tenantId/:projectId/stalled" component={ProtectedStalledUnits} /><Route path="/projects/:tenantId/:projectId/completion-report" component={ProtectedCompletionReport} /><Route path="/projects/:tenantId/:projectId/site" component={ProtectedSite} /><Route path="/projects/:tenantId/:projectId/reports" component={ProtectedReports} /><Route path="/projects/:tenantId/:projectId/import" component={ProtectedImportHub} /><Route path="/projects/:tenantId/:projectId/import/:kind" component={ProtectedImportKind} /><Route path="/projects/:tenantId/:projectId/meetings" component={ProtectedProjectMeetings} /><Route path="/projects/:tenantId/:projectId/safety" component={ProtectedProjectSafety} /><Route path="/projects/:tenantId/:projectId/risks" component={ProtectedProjectRisks} /><Route path="/projects/:tenantId/:projectId/schedule" component={ProtectedLiveSchedule} /><Route path="/projects/:tenantId/:projectId/baseline" component={ProtectedBaseline} /><Route path="/projects/:tenantId/:projectId/team" component={ProtectedTeam} /><Route path="/projects/:tenantId/:projectId/guide" component={ProtectedGuide} /><Route path="/planner/:tenantId" component={ProtectedPlanner} /><Route path="/projects/:tenantId/:projectId/weekly-report" component={ProtectedWeeklyReport} /><Route path="/projects/:tenantId/:projectId/monthly-report" component={ProtectedMonthlyReport} /><Route path="/projects/:tenantId/new" component={ProtectedSetupWizard} /><Route path="/projects/:tenantId" component={ProtectedProjects} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LanguageProvider><LanguageAccountSync><TooltipProvider><Toaster /><Router /></TooltipProvider></LanguageAccountSync></LanguageProvider></ThemeProvider></ErrorBoundary>;
}
