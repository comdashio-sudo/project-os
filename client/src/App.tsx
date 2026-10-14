import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import EvmCalculator from "./pages/EvmCalculator";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ProjectControls from "./pages/ProjectControls";
import MyPerformance from "./pages/MyPerformance";
import ProjectRegistry from "./pages/ProjectRegistry";
import PmoDashboard from "./pages/PmoDashboard";
import TenantAdministration from "./pages/TenantAdministration";
import AcceptInvitation from "./pages/AcceptInvitation";
import LicensingConsole from "./pages/LicensingConsole";
import BillingRegister from "./pages/BillingRegister";
import SupportCenter from "./pages/SupportCenter";
import EmployeeRegistry from "./pages/EmployeeRegistry";
import PayrollWorkspace from "./pages/PayrollWorkspace";
import CommercialChain from "./pages/CommercialChain";
import ProjectProfitability from "./pages/ProjectProfitability";
import UserProfile from "./pages/UserProfile";
import RequireAuth from "./components/RequireAuth";
import type { ComponentType } from "react";
import { Route, Switch } from "wouter";

function withAuth(Component: ComponentType<any>) {
  return function AuthenticatedRoute(props: any) {
    return <RequireAuth><Component {...props} /></RequireAuth>;
  };
}

const ProtectedProfile = withAuth(UserProfile);
const ProtectedEvm = withAuth(EvmCalculator);
const ProtectedExecutive = withAuth(ExecutiveDashboard);
const ProtectedPmo = withAuth(PmoDashboard);
const ProtectedLicensing = withAuth(LicensingConsole);
const ProtectedBilling = withAuth(BillingRegister);
const ProtectedSupport = withAuth(SupportCenter);
const ProtectedPeople = withAuth(EmployeeRegistry);
const ProtectedPayroll = withAuth(PayrollWorkspace);
const ProtectedAdministration = withAuth(TenantAdministration);
const ProtectedMyPerformance = withAuth(MyPerformance);
const ProtectedControls = withAuth(ProjectControls);
const ProtectedCommercial = withAuth(CommercialChain);
const ProtectedProfitability = withAuth(ProjectProfitability);
const ProtectedProjects = withAuth(ProjectRegistry);

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/profile" component={ProtectedProfile} /><Route path="/evm" component={ProtectedEvm} /><Route path="/invite/accept" component={AcceptInvitation} /><Route path="/executive/:tenantId" component={ProtectedExecutive} /><Route path="/pmo/:tenantId" component={ProtectedPmo} /><Route path="/licensing/:tenantId" component={ProtectedLicensing} /><Route path="/billing/:tenantId" component={ProtectedBilling} /><Route path="/support/:tenantId" component={ProtectedSupport} /><Route path="/people/:tenantId" component={ProtectedPeople} /><Route path="/payroll/:tenantId" component={ProtectedPayroll} /><Route path="/tenants/:tenantId/administration" component={ProtectedAdministration} /><Route path="/projects/:tenantId/:projectId/my-performance" component={ProtectedMyPerformance} /><Route path="/projects/:tenantId/:projectId/controls" component={ProtectedControls} /><Route path="/projects/:tenantId/:projectId/commercial" component={ProtectedCommercial} /><Route path="/projects/:tenantId/:projectId/profitability" component={ProtectedProfitability} /><Route path="/projects/:tenantId" component={ProtectedProjects} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LanguageProvider><TooltipProvider><Toaster /><Router /></TooltipProvider></LanguageProvider></ThemeProvider></ErrorBoundary>;
}
