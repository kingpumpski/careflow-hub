import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Shield, FileCheck, TrendingUp, Settings2, ChevronDown, ChevronRight, LogOut,
  Activity, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/modules/security";
import type { Permission } from "@/modules/security";

interface NavChild {
  label: string;
  path: string;
  permission?: Permission;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: NavChild[];
}

/** Grouped navigation: Dashboard, Claims Intelligence, Pre-Authorization, Analytics, Administration. */
export const NAV_GROUPS: NavGroup[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  {
    label: "Claims Intelligence",
    icon: Shield,
    children: [
      { label: "Monthly Claims Entry", path: "/claims", permission: "claims.read" },
      { label: "Insurance Companies", path: "/insurance", permission: "claims.read" },
      { label: "Claims Schedule", path: "/schedule", permission: "reports.read" },
      { label: "Settlement Tracking", path: "/payments", permission: "payments.read" },
      { label: "Outstanding", path: "/outstanding", permission: "payments.read" },
      { label: "Rejections", path: "/rejections", permission: "claims.read" },
      { label: "Withholding Tax", path: "/withholding-tax", permission: "payments.read" },
      { label: "Bulk Import", path: "/insurance-import", permission: "masterdata.write" },
      { label: "Duplicate Audit", path: "/duplicate-audit", permission: "audit.read" },
      { label: "Reports", path: "/reports", permission: "reports.read" },
      { label: "General Ledger", path: "/ledger", permission: "ledger.read" },
    ],
  },
  {
    label: "Pre-Authorization",
    icon: FileCheck,
    children: [
      { label: "Authorization Requests", path: "/pre-auth", permission: "preauth.read" },
      { label: "Patients / Clients", path: "/clients", permission: "preauth.read" },
      { label: "Doctors", path: "/doctors", permission: "preauth.read" },
      { label: "Procedures", path: "/procedures", permission: "preauth.read" },
      { label: "Procedure Templates", path: "/templates", permission: "preauth.read" },
      { label: "Cost Builder Items", path: "/catalog", permission: "preauth.read" },
      { label: "Diagnosis Master", path: "/diagnosis-codes", permission: "preauth.read" },
    ],
  },
  {
    label: "Analytics",
    icon: TrendingUp,
    children: [
      { label: "Performance Analytics", path: "/analytics", permission: "analytics.read" },
      { label: "Revenue & Trends", path: "/preauth-analytics", permission: "analytics.read" },
      { label: "Provider Performance", path: "/provider-performance", permission: "analytics.read" },
      { label: "Insurer Scorecard", path: "/insurer-scorecard", permission: "analytics.read" },
      { label: "Service Lines", path: "/service-lines", permission: "analytics.read" },
      { label: "Fraud Alerts", path: "/fraud-alerts", permission: "analytics.read" },
    ],
  },
  {
    label: "Administration",
    icon: Settings2,
    children: [
      { label: "Users & Roles", path: "/users", permission: "users.manage" },
      { label: "Audit Logs", path: "/audit-trail", permission: "audit.read" },
      { label: "Messages", path: "/chat" },
      { label: "Notifications", path: "/notifications" },
      { label: "Settings", path: "/settings", permission: "settings.manage" },
    ],
  },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const location = useLocation();
  const { signOut } = useAuth();
  const { can, roleLabel } = usePermissions();

  const groupContaining = (g: NavGroup) => g.children?.some((c) => c.path === location.pathname);
  const [expanded, setExpanded] = useState<string[]>(() => {
    const open = NAV_GROUPS.filter(groupContaining).map((g) => g.label);
    return open.length ? open : ["Claims Intelligence"];
  });

  const toggle = (label: string) =>
    setExpanded((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));

  const isActive = (path: string) => location.pathname === path;
  const visible = (child: NavChild) => !child.permission || can(child.permission);

  return (
    <aside className="w-64 h-screen sticky top-0 bg-sidebar flex flex-col border-r border-sidebar-border no-print">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-base font-bold text-sidebar-primary-foreground truncate">CareFlow Hub</h1>
            <p className="text-[11px] text-sidebar-muted truncate">{roleLabel ?? "Revenue Operations"}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          if (!group.children) {
            return (
              <Link
                key={group.path}
                to={group.path!}
                onClick={onNavigate}
                className={`sidebar-item ${isActive(group.path!) ? "sidebar-item-active" : ""}`}
              >
                <group.icon className="w-[18px] h-[18px]" />
                {group.label}
              </Link>
            );
          }

          const children = group.children.filter(visible);
          if (!children.length) return null;
          const open = expanded.includes(group.label);

          return (
            <div key={group.label}>
              <button onClick={() => toggle(group.label)} className="sidebar-item w-full justify-between">
                <span className="flex items-center gap-3">
                  <group.icon className="w-[18px] h-[18px]" />
                  {group.label}
                </span>
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {open && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3">
                  {children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      onClick={onNavigate}
                      className={`sidebar-item text-[13px] ${isActive(child.path) ? "sidebar-item-active" : ""}`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button onClick={signOut} className="sidebar-item w-full text-destructive/80 hover:text-destructive">
          <LogOut className="w-[18px] h-[18px]" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
