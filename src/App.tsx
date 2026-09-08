import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/layout/AppShell";
import { CareFlowRuntime } from "@/components/CareFlowRuntime";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
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

const queryClient = new QueryClient();
function RouteFallback() { return <div className="min-h-screen flex items-center justify-center bg-background"><div className="text-center space-y-3"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-muted-foreground">Loading...</p></div></div>; }
function ProtectedRoutes() { const { user, loading } = useAuth(); if (loading) return <RouteFallback />; if (!user) return <Navigate to="/auth" replace />; return <Suspense fallback={<RouteFallback />}><Routes><Route element={<AppShell />}><Route path="/" element={<Dashboard />} /><Route path="/pre-auth" element={<PreAuthorization />} /><Route path="/pre-auth/studio" element={<PreAuthorizationStudioRoute />} /><Route path="/claims" element={<Claims />} /><Route path="/claims/settlements" element={<ClaimsSettlement />} /><Route path="/payments" element={<Payments />} /><Route path="/outstanding" element={<Outstanding />} /><Route path="/rejections" element={<Rejections />} /><Route path="/withholding-tax" element={<WithholdingTax />} /><Route path="/reports" element={<Reports />} /><Route path="/schedule" element={<ScheduleGenerator />} /><Route path="/clients" element={<Clients />} /><Route path="/doctors" element={<Doctors />} /><Route path="/procedures" element={<Procedures />} /><Route path="/templates" element={<ProcedureTemplates />} /><Route path="/catalog" element={<CatalogItems />} /><Route path="/insurance" element={<InsuranceCompanies />} /><Route path="/users" element={<UsersPage />} /><Route path="/ledger" element={<Ledger />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/audit-trail" element={<AuditTrail />} /><Route path="/provider-performance" element={<ProviderPerformance />} /><Route path="/fraud-alerts" element={<FraudAlerts />} /><Route path="/analytics" element={<Analytics />} /><Route path="/insurer-scorecard" element={<InsurerScorecard />} /><Route path="/service-lines" element={<ServiceLines />} /><Route path="/notifications" element={<Notifications />} /><Route path="/preauth-analytics" element={<PreAuthAnalytics />} /><Route path="/diagnosis-codes" element={<DiagnosisCodes />} /><Route path="/chat" element={<Chat />} /><Route path="/profile" element={<Profile />} /><Route path="/insurance-import" element={<InsuranceBulkImport />} /><Route path="/document-intake" element={<DocumentIntake />} /><Route path="/duplicate-audit" element={<DuplicateAudit />} /></Route><Route path="*" element={<NotFound />} /></Routes></Suspense>; }
function AuthRoute() { const { user, loading } = useAuth(); if (loading) return <RouteFallback />; if (user) return <Navigate to="/" replace />; return <Suspense fallback={<RouteFallback />}><AuthPage /></Suspense>; }
const App = () => <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><BrowserRouter basename={import.meta.env.BASE_URL}><AuthProvider><ChunkLoadRecovery><Routes><Route path="/auth" element={<AuthRoute />} /><Route path="/*" element={<ProtectedRoutes />} /></Routes><CareFlowRuntime /></ChunkLoadRecovery></AuthProvider></BrowserRouter></TooltipProvider></QueryClientProvider>;
export default App;
