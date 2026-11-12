import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { LanguageAccountSync } from "./contexts/LanguageAccountSync";
import EvmCalculator from "./pages/EvmCalculator";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ProjectControls from "./pages/ProjectControls";
import MyPerformance from "./pages/MyPerformance";
import ProjectRegistry from "./pages/ProjectRegistry";
import SetupWizard from "./pages/SetupWizard";
import MyCompanies from "./pages/MyCompanies";
import ProjectTeam from "./pages/ProjectTeam";
import UserGuide from "./pages/UserGuide";
import PmoDashboard from "./pages/PmoDashboard";
import TenantAdministration from "./pages/TenantAdministration";
import AcceptInvitation from "./pages/AcceptInvitation";
import LicensingConsole from "./pages/LicensingConsole";
import PlatformAdmin from "./pages/PlatformAdmin";
import BillingRegister from "./pages/BillingRegister";
import SupportCenter from "./pages/SupportCenter";
import EmployeeRegistry from "./pages/EmployeeRegistry";
import PayrollWorkspace from "./pages/PayrollWorkspace";
import CommercialChain from "./pages/CommercialChain";
import ProjectProfitability from "./pages/ProjectProfitability";
import FieldEntry from "./pages/FieldEntry";
import QuickIssue from "./pages/QuickIssue";
import ProjectPmc from "./pages/ProjectPmc";
import ProjectBaseline from "./pages/ProjectBaseline";
import PmcSiteConsultant from "./pages/PmcSiteConsultant";
import PmcSiteUpdate from "./pages/PmcSiteUpdate";
import LevelEntry from "./pages/LevelEntry";
import LevelCompany from "./pages/LevelCompany";
import LevelPortfolio from "./pages/LevelPortfolio";
import LevelProject from "./pages/LevelProject";
import LevelWarehouse from "./pages/LevelWarehouse";
import UserProfile from "./pages/UserProfile";
import SiteDailyReport from "./pages/SiteDailyReport";
import ProjectSubmittals from "./pages/ProjectSubmittals";
import ProjectQuality from "./pages/ProjectQuality";
import UnitCard from "./pages/UnitCard";
import IntegrationSettings from "./pages/IntegrationSettings";
import RequireAuth from "./components/RequireAuth";
import { PermissionProvider } from "./lib/permissions";
import { RouteBoundary } from "./components/RouteBoundary";
import { ProductShell, isFramedPath } from "./components/ProductShell";
import { Suspense, lazy, type ComponentType } from "react";
import { Route, Switch, useLocation } from "wouter";

// The design preview (work order 19) is its own chunk: the fonts and the component library it loads are not part of the main bundle.
const DesignPreview = lazy(() => import("./pages/DesignPreview"));
const DesignPreviewFrame = lazy(() => import("./pages/DesignPreviewFrame"));
const lazyPage = (Page: ComponentType) => function LazyRoute() { return <Suspense fallback={<p role="status" className="p-6">…</p>}><Page /></Suspense>; };

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
const ProtectedControls = withAuth(ProjectControls);
const ProtectedCommercial = withAuth(CommercialChain);
const ProtectedProfitability = withAuth(ProjectProfitability);
const ProtectedFieldEntry = withAuth(FieldEntry);
const ProtectedQuickIssue = withAuth(QuickIssue);
const ProtectedPmc = withAuth(ProjectPmc);
const ProtectedBaseline = withAuth(ProjectBaseline);
const ProtectedSiteConsultant = withAuth(PmcSiteConsultant);
const ProtectedSiteUpdate = withAuth(PmcSiteUpdate);
const ProtectedProjects = withAuth(ProjectRegistry);
const ProtectedSetup = withAuth(SetupWizard);
const ProtectedMyCompanies = withAuth(MyCompanies);
const ProtectedTeam = withAuth(ProjectTeam);
const ProtectedGuide = withAuth(UserGuide);
const ProtectedLevelEntry = withAuth(LevelEntry);
const ProtectedLevelCompany = withAuth(LevelCompany);
const ProtectedLevelPortfolio = withAuth(LevelPortfolio);
const ProtectedLevelProject = withAuth(LevelProject);
const ProtectedLevelWarehouse = withAuth(LevelWarehouse);
const ProtectedSiteReport = withAuth(SiteDailyReport);
const ProtectedSubmittals = withAuth(ProjectSubmittals);
const ProtectedQuality = withAuth(ProjectQuality);
const ProtectedUnitCard = withAuth(UnitCard);
const ProtectedIntegrations = withAuth(IntegrationSettings);

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/design-preview/frame/:direction/:screen" component={ProtectedDesignFrame} /><Route path="/design-preview" component={ProtectedDesignPreview} /><Route path="/profile" component={ProtectedProfile} /><Route path="/evm" component={ProtectedEvm} /><Route path="/invite/accept" component={AcceptInvitation} /><Route path="/companies" component={ProtectedMyCompanies} /><Route path="/companies/:tenantId" component={ProtectedMyCompanies} /><Route path="/setup" component={ProtectedSetup} /><Route path="/setup/:tenantId" component={ProtectedSetup} /><Route path="/levels/:tenantId" component={ProtectedLevelEntry} /><Route path="/levels/:tenantId/company" component={ProtectedLevelCompany} /><Route path="/levels/:tenantId/portfolio" component={ProtectedLevelPortfolio} /><Route path="/levels/:tenantId/projects/:projectId" component={ProtectedLevelProject} /><Route path="/levels/:tenantId/projects/:projectId/warehouse" component={ProtectedLevelWarehouse} /><Route path="/executive/:tenantId" component={ProtectedExecutive} /><Route path="/pmo/:tenantId" component={ProtectedPmo} /><Route path="/platform" component={ProtectedPlatform} /><Route path="/licensing/:tenantId" component={ProtectedLicensing} /><Route path="/billing/:tenantId" component={ProtectedBilling} /><Route path="/support/:tenantId" component={ProtectedSupport} /><Route path="/people/:tenantId" component={ProtectedPeople} /><Route path="/payroll/:tenantId" component={ProtectedPayroll} /><Route path="/tenants/:tenantId/administration" component={ProtectedAdministration} /><Route path="/projects/:tenantId/:projectId/my-performance" component={ProtectedMyPerformance} /><Route path="/projects/:tenantId/:projectId/controls" component={ProtectedControls} /><Route path="/projects/:tenantId/:projectId/commercial" component={ProtectedCommercial} /><Route path="/projects/:tenantId/:projectId/profitability" component={ProtectedProfitability} /><Route path="/m/:tenantId/:projectId/issue" component={ProtectedQuickIssue} /><Route path="/m/:tenantId/:projectId/report" component={ProtectedSiteReport} /><Route path="/m/:tenantId/:projectId/site-update" component={ProtectedSiteUpdate} /><Route path="/m/:tenantId/:projectId/unit/:unitNumber" component={ProtectedUnitCard} /><Route path="/projects/:tenantId/:projectId/submittals" component={ProtectedSubmittals} /><Route path="/projects/:tenantId/:projectId/quality" component={ProtectedQuality} /><Route path="/integrations/:tenantId" component={ProtectedIntegrations} /><Route path="/m/:tenantId/:projectId" component={ProtectedFieldEntry} /><Route path="/projects/:tenantId/:projectId/site-consultant" component={ProtectedSiteConsultant} /><Route path="/projects/:tenantId/:projectId/pmc" component={ProtectedPmc} /><Route path="/projects/:tenantId/:projectId/baseline" component={ProtectedBaseline} /><Route path="/projects/:tenantId/:projectId/team" component={ProtectedTeam} /><Route path="/projects/:tenantId/:projectId/guide" component={ProtectedGuide} /><Route path="/projects/:tenantId" component={ProtectedProjects} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LanguageProvider><LanguageAccountSync><TooltipProvider><Toaster /><Router /></TooltipProvider></LanguageAccountSync></LanguageProvider></ThemeProvider></ErrorBoundary>;
}
