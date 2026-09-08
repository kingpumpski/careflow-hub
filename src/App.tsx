import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import { CareFlowRuntime } from "@/components/CareFlowRuntime";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import { usePermissions } from "@/modules/security";
import type { Permission } from "@/modules/security";
import "./App.css";

const AuthPage = lazy(() => import("@/pages/AuthPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const PreAuthorization = lazy(() => import("@/pages/PreAuthorization"));
const PreAuthorizationStudioRoute = lazy(() => import("@/pages/PreAuthorizationStudioRoute"));
const Claims = lazy(() => import("@/pages/Claims"));
const ClaimsSettlement = lazy(() => import("@/pages/ClaimsSettlement"));
const Payments = lazy(() => import("@/pages/Payments"));
const Outstanding = lazy(() => import("@/pages/Outstanding"));
const Rejections = lazy(() => import("@/pages/Rejections"));
const WithholdingTax = lazy(() => import("@/pages/WithholdingTax"));
const Reports = lazy(() => import("@/pages/Reports"));
const ScheduleGenerator = lazy(() => import("@/pages/ScheduleGenerator"));
const Clients = lazy(() => import("@/pages/Clients"));
const Doctors = lazy(() => import("@/pages/Doctors"));
const Procedures = lazy(() => import("@/pages/Procedures"));
const ProcedureTemplates = lazy(() => import("@/pages/ProcedureTemplates"));
const CatalogItems = lazy(() => import("@/pages/CatalogItems"));
const InsuranceCompanies = lazy(() => import("@/pages/InsuranceCompanies"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const Ledger = lazy(() => import("@/pages/Ledger"));
const AuditTrail = lazy(() => import("@/pages/AuditTrail"));
const ProviderPerformance = lazy(() => import("@/pages/ProviderPerformance"));
const FraudAlerts = lazy(() => import("@/pages/FraudAlerts"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const InsurerScorecard = lazy(() => import("@/pages/InsurerScorecard"));
const ServiceLines = lazy(() => import("@/pages/ServiceLines"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const PreAuthAnalytics = lazy(() => import("@/pages/PreAuthAnalytics"));
const DiagnosisCodes = lazy(() => import("@/pages/DiagnosisCodes"));
const Chat = lazy(() => import("@/pages/Chat"));
const Profile = lazy(() => import("@/pages/Profile"));
const InsuranceBulkImport = lazy(() => import("@/pages/InsuranceBulkImport"));
const DocumentIntake = lazy(() => import("@/pages/DocumentIntake"));
const DuplicateAudit = lazy(() => import("@/pages/DuplicateAudit"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function RouteFallback() { return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-center space-y-3"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-muted-foreground">Loading...</p></div></div>; }
function AccessDenied({ permission }: { permission: Permission }) { const location = useLocation(); return <div className="stat-card py-12 text-center space-y-3"><h1 className="text-lg font-semibold">Access restricted</h1><p className="text-sm text-muted-foreground">Your current role does not have <strong>{permission}</strong> permission for this area.</p><button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => { window.location.assign("/"); }}>Return to dashboard</button><span className="sr-only">Requested route: {location.pathname}</span></div>; }
function PermissionRoute({ permission, children }: { permission: Permission; children: ReactNode }) { const { loading, can } = usePermissions(); if (loading) return <RouteFallback />; return can(permission) ? <>{children}</> : <AccessDenied permission={permission} />; }
function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Suspense fallback={<RouteFallback />}><Routes><Route element={<AppShell />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/pre-auth" element={<PermissionRoute permission="preauth.read"><PreAuthorization /></PermissionRoute>} />
    <Route path="/pre-auth/studio" element={<PermissionRoute permission="preauth.read"><PreAuthorizationStudioRoute /></PermissionRoute>} />
    <Route path="/claims" element={<PermissionRoute permission="claims.read"><Claims /></PermissionRoute>} />
    <Route path="/claims/settlements" element={<PermissionRoute permission="payments.read"><ClaimsSettlement /></PermissionRoute>} />
    <Route path="/payments" element={<PermissionRoute permission="payments.read"><Payments /></PermissionRoute>} />
    <Route path="/outstanding" element={<PermissionRoute permission="payments.read"><Outstanding /></PermissionRoute>} />
    <Route path="/rejections" element={<PermissionRoute permission="claims.read"><Rejections /></PermissionRoute>} />
    <Route path="/withholding-tax" element={<PermissionRoute permission="payments.read"><WithholdingTax /></PermissionRoute>} />
    <Route path="/reports" element={<PermissionRoute permission="reports.read"><Reports /></PermissionRoute>} />
    <Route path="/schedule" element={<PermissionRoute permission="reports.read"><ScheduleGenerator /></PermissionRoute>} />
    <Route path="/clients" element={<PermissionRoute permission="preauth.read"><Clients /></PermissionRoute>} />
    <Route path="/doctors" element={<PermissionRoute permission="preauth.read"><Doctors /></PermissionRoute>} />
    <Route path="/procedures" element={<PermissionRoute permission="preauth.read"><Procedures /></PermissionRoute>} />
    <Route path="/templates" element={<PermissionRoute permission="preauth.read"><ProcedureTemplates /></PermissionRoute>} />
    <Route path="/catalog" element={<PermissionRoute permission="preauth.read"><CatalogItems /></PermissionRoute>} />
    <Route path="/insurance" element={<PermissionRoute permission="claims.read"><InsuranceCompanies /></PermissionRoute>} />
    <Route path="/users" element={<PermissionRoute permission="users.manage"><UsersPage /></PermissionRoute>} />
    <Route path="/ledger" element={<PermissionRoute permission="ledger.read"><Ledger /></PermissionRoute>} />
    <Route path="/settings" element={<PermissionRoute permission="settings.manage"><SettingsPage /></PermissionRoute>} />
    <Route path="/audit-trail" element={<PermissionRoute permission="audit.read"><AuditTrail /></PermissionRoute>} />
    <Route path="/provider-performance" element={<PermissionRoute permission="analytics.read"><ProviderPerformance /></PermissionRoute>} />
    <Route path="/fraud-alerts" element={<PermissionRoute permission="analytics.read"><FraudAlerts /></PermissionRoute>} />
    <Route path="/analytics" element={<PermissionRoute permission="analytics.read"><Analytics /></PermissionRoute>} />
    <Route path="/insurer-scorecard" element={<PermissionRoute permission="analytics.read"><InsurerScorecard /></PermissionRoute>} />
    <Route path="/service-lines" element={<PermissionRoute permission="analytics.read"><ServiceLines /></PermissionRoute>} />
    <Route path="/notifications" element={<Notifications />} />
    <Route path="/preauth-analytics" element={<PermissionRoute permission="analytics.read"><PreAuthAnalytics /></PermissionRoute>} />
    <Route path="/diagnosis-codes" element={<PermissionRoute permission="preauth.read"><DiagnosisCodes /></PermissionRoute>} />
    <Route path="/chat" element={<Chat />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/insurance-import" element={<PermissionRoute permission="masterdata.write"><InsuranceBulkImport /></PermissionRoute>} />
    <Route path="/document-intake" element={<PermissionRoute permission="masterdata.write"><DocumentIntake /></PermissionRoute>} />
    <Route path="/duplicate-audit" element={<PermissionRoute permission="audit.read"><DuplicateAudit /></PermissionRoute>} />
    <Route path="*" element={<NotFound />} />
  </Route></Routes></Suspense>;
}
function AuthRoute() { const { user, loading } = useAuth(); if (loading) return <RouteFallback />; if (user) return <Navigate to="/" replace />; return <Suspense fallback={<RouteFallback />}><AuthPage /></Suspense>; }
const App = () => <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><BrowserRouter><AuthProvider><ChunkLoadRecovery><Routes><Route path="/auth" element={<AuthRoute />} /><Route path="/*" element={<ProtectedRoutes />} /></Routes><CareFlowRuntime /></ChunkLoadRecovery></AuthProvider></BrowserRouter></TooltipProvider></QueryClientProvider>;
export default App;
