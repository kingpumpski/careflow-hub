import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, FileCheck, Shield, CreditCard, Receipt, BarChart3, Users, Settings,
  Building2, Stethoscope, ChevronDown, ChevronRight, LogOut, Bot, AlertCircle, Layers, Ban, BookOpen, Package, ClipboardList,
  TrendingUp, ShieldAlert, Layers as LayersIcon, Bell, MessageSquare,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  {
    label: "Pre-Authorization", icon: FileCheck,
    children: [
      { label: "Requests", path: "/pre-auth" },
      { label: "Patients / Clients", path: "/clients" },
      { label: "Doctors", path: "/doctors" },
      { label: "Procedures", path: "/procedures" },
      { label: "Templates", path: "/templates" },
      { label: "Diagnosis Master", path: "/diagnosis-codes" },
      { label: "Catalog Items", path: "/catalog" },
      { label: "Analytics", path: "/preauth-analytics" },
    ],
  },
  {
    label: "Insurance", icon: Shield,
    children: [
      { label: "Claims", path: "/claims" },
      { label: "Payments", path: "/payments" },
      { label: "Outstanding", path: "/outstanding" },
      { label: "Rejections", path: "/rejections" },
      { label: "Withholding Tax", path: "/withholding-tax" },
      { label: "Companies", path: "/insurance" },
    ],
  },
  { label: "Reports", icon: BarChart3, path: "/reports" },
  {
    label: "Analytics", icon: TrendingUp,
    children: [
      { label: "Strategic Analytics", path: "/analytics" },
      { label: "Provider Performance", path: "/provider-performance" },
      { label: "Insurer Scorecard", path: "/insurer-scorecard" },
      { label: "Service Lines", path: "/service-lines" },
      { label: "Fraud Alerts", path: "/fraud-alerts" },
      { label: "Pre-Auth Analytics", path: "/preauth-analytics" },
    ],
  },
  { label: "General Ledger", icon: BookOpen, path: "/ledger" },
  { label: "Messages", icon: MessageSquare, path: "/chat" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Users", icon: Users, path: "/users" },
  { label: "AI Assistant", icon: Bot, path: "/ai-assistant" },
];

export default function AppSidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["Insurance", "Pre-Authorization"]);

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="w-64 min-h-screen bg-sidebar flex flex-col border-r border-sidebar-border">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-base font-bold text-sidebar-primary-foreground">MedClaims</h1>
            <p className="text-[11px] text-sidebar-muted">Insurance Management</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) =>
          item.children ? (
            <div key={item.label}>
              <button onClick={() => toggleMenu(item.label)} className="sidebar-item w-full justify-between">
                <span className="flex items-center gap-3"><item.icon className="w-[18px] h-[18px]" />{item.label}</span>
                {expandedMenus.includes(item.label) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {expandedMenus.includes(item.label) && (
                <div className="ml-8 mt-0.5 space-y-0.5">
                  {item.children.map((child) => (
                    <Link key={child.path} to={child.path} className={`sidebar-item ${isActive(child.path) ? "sidebar-item-active" : ""}`}>
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link key={item.path} to={item.path!} className={`sidebar-item ${isActive(item.path!) ? "sidebar-item-active" : ""}`}>
              <item.icon className="w-[18px] h-[18px]" />{item.label}
            </Link>
          )
        )}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button onClick={signOut} className="sidebar-item w-full text-destructive/80 hover:text-destructive">
          <LogOut className="w-[18px] h-[18px]" />Sign Out
        </button>
      </div>
    </aside>
  );
}
