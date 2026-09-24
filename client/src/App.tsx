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
import { Route, Switch } from "wouter";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/profile" component={UserProfile} /><Route path="/evm" component={EvmCalculator} /><Route path="/invite/accept" component={AcceptInvitation} /><Route path="/executive/:tenantId" component={ExecutiveDashboard} /><Route path="/pmo/:tenantId" component={PmoDashboard} /><Route path="/licensing/:tenantId" component={LicensingConsole} /><Route path="/billing/:tenantId" component={BillingRegister} /><Route path="/support/:tenantId" component={SupportCenter} /><Route path="/people/:tenantId" component={EmployeeRegistry} /><Route path="/payroll/:tenantId" component={PayrollWorkspace} /><Route path="/tenants/:tenantId/administration" component={TenantAdministration} /><Route path="/projects/:tenantId/:projectId/my-performance" component={MyPerformance} /><Route path="/projects/:tenantId/:projectId/controls" component={ProjectControls} /><Route path="/projects/:tenantId/:projectId/commercial" component={CommercialChain} /><Route path="/projects/:tenantId/:projectId/profitability" component={ProjectProfitability} /><Route path="/projects/:tenantId" component={ProjectRegistry} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><LanguageProvider><TooltipProvider><Toaster /><Router /></TooltipProvider></LanguageProvider></ThemeProvider></ErrorBoundary>;
}
