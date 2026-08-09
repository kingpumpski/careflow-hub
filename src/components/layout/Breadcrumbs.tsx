import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  "pre-auth": "Pre-Authorization Requests",
  claims: "Claims",
  payments: "Payments",
  outstanding: "Outstanding",
  rejections: "Rejections",
  "withholding-tax": "Withholding Tax",
  reports: "Reports",
  schedule: "Schedule Generator",
  clients: "Patients / Clients",
  doctors: "Doctors",
  procedures: "Procedures",
  templates: "Procedure Templates",
  catalog: "Catalog Items",
  insurance: "Insurance Companies",
  users: "Users",
  ledger: "General Ledger",
  settings: "Settings",
  "audit-trail": "Audit Trail",
  "provider-performance": "Provider Performance",
  "fraud-alerts": "Fraud Alerts",
  analytics: "Strategic Analytics",
  "insurer-scorecard": "Insurer Scorecard",
  "service-lines": "Service Lines",
  notifications: "Notifications",
  "preauth-analytics": "Pre-Auth Analytics",
  "diagnosis-codes": "Diagnosis Master",
  chat: "Messages",
  profile: "My Profile",
  "insurance-import": "Insurance Bulk Import",
  "duplicate-audit": "Duplicate Audit",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm min-w-0">
      <Link to="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
        <Home className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Dashboard</span>
      </Link>
      {segments.map((seg, i) => {
        const to = "/" + segments.slice(0, i + 1).join("/");
        const label = LABELS[seg] || seg.replace(/-/g, " ");
        const last = i === segments.length - 1;
        return (
          <span key={to} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {last ? (
              <span className="font-medium truncate capitalize">{label}</span>
            ) : (
              <Link to={to} className="text-muted-foreground hover:text-foreground truncate capitalize">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}