import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import PreAuthorization from "@/pages/PreAuthorization";
import Claims from "@/pages/Claims";
import Payments from "@/pages/Payments";
import WithholdingTax from "@/pages/WithholdingTax";
import Reports from "@/pages/Reports";
import Clients from "@/pages/Clients";
import Doctors from "@/pages/Doctors";
import Procedures from "@/pages/Procedures";
import UsersPage from "@/pages/UsersPage";
import AIAssistant from "@/pages/AIAssistant";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pre-auth" element={<PreAuthorization />} />
            <Route path="/claims" element={<Claims />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/withholding-tax" element={<WithholdingTax />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/doctors" element={<Doctors />} />
            <Route path="/procedures" element={<Procedures />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
