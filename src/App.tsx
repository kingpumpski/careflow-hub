import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import PreAuthorization from "@/pages/PreAuthorization";
import Claims from "@/pages/Claims";
import Payments from "@/pages/Payments";
import Outstanding from "@/pages/Outstanding";
import Rejections from "@/pages/Rejections";
import WithholdingTax from "@/pages/WithholdingTax";
import Reports from "@/pages/Reports";
import Clients from "@/pages/Clients";
import Doctors from "@/pages/Doctors";
import Procedures from "@/pages/Procedures";
import ProcedureTemplates from "@/pages/ProcedureTemplates";
import CatalogItems from "@/pages/CatalogItems";
import InsuranceCompanies from "@/pages/InsuranceCompanies";
import UsersPage from "@/pages/UsersPage";
import AIAssistant from "@/pages/AIAssistant";
import SettingsPage from "@/pages/SettingsPage";
import Ledger from "@/pages/Ledger";
import AuditTrail from "@/pages/AuditTrail";
import ProviderPerformance from "@/pages/ProviderPerformance";
import FraudAlerts from "@/pages/FraudAlerts";
import Analytics from "@/pages/Analytics";
import InsurerScorecard from "@/pages/InsurerScorecard";
import ServiceLines from "@/pages/ServiceLines";
import Notifications from "@/pages/Notifications";
import PreAuthAnalytics from "@/pages/PreAuthAnalytics";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pre-auth" element={<PreAuthorization />} />
        <Route path="/claims" element={<Claims />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/outstanding" element={<Outstanding />} />
        <Route path="/rejections" element={<Rejections />} />
        <Route path="/withholding-tax" element={<WithholdingTax />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/procedures" element={<Procedures />} />
        <Route path="/templates" element={<ProcedureTemplates />} />
        <Route path="/catalog" element={<CatalogItems />} />
        <Route path="/insurance" element={<InsuranceCompanies />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/ai-assistant" element={<AIAssistant />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit-trail" element={<AuditTrail />} />
        <Route path="/provider-performance" element={<ProviderPerformance />} />
        <Route path="/fraud-alerts" element={<FraudAlerts />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/insurer-scorecard" element={<InsurerScorecard />} />
        <Route path="/service-lines" element={<ServiceLines />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/preauth-analytics" element={<PreAuthAnalytics />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
