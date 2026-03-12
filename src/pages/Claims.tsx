import { useState } from "react";
import { Search, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mockClaims = [
  { id: "CLM-001", patient: "Kwame Asante", insurance: "ACACIA Health", procedure: "MRI Scan", amount: "GH¢ 3,600", date: "2026-03-01", month: "March", status: "paid" },
  { id: "CLM-002", patient: "Ama Mensah", insurance: "ACE Insurance", procedure: "CT Scan", amount: "GH¢ 2,800", date: "2026-03-02", month: "March", status: "submitted" },
  { id: "CLM-003", patient: "Yaw Boateng", insurance: "APEX Health", procedure: "Surgery", amount: "GH¢ 12,500", date: "2026-02-28", month: "February", status: "pending" },
  { id: "CLM-004", patient: "Efua Darkwa", insurance: "STAR Assurance", procedure: "Lab Tests", amount: "GH¢ 850", date: "2026-03-05", month: "March", status: "rejected" },
  { id: "CLM-005", patient: "Kofi Adjei", insurance: "ACACIA Health", procedure: "Consultation", amount: "GH¢ 200", date: "2026-03-08", month: "March", status: "appealed" },
  { id: "CLM-006", patient: "Adwoa Sarpong", insurance: "ACE Insurance", procedure: "Dental", amount: "GH¢ 1,500", date: "2026-03-10", month: "March", status: "paid" },
];

const statusStyles: Record<string, string> = {
  submitted: "bg-info/10 text-info border-info/20",
  paid: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  appealed: "bg-chart-4/10 text-chart-4 border-chart-4/20",
};

const tabs = ["all", "submitted", "paid", "pending", "rejected", "appealed"];

export default function Claims() {
  const [activeTab, setActiveTab] = useState("all");
  const filtered = activeTab === "all" ? mockClaims : mockClaims.filter((c) => c.status === activeTab);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Claims Management</h1>
          <p className="page-description">Track and manage insurance claims across all stages</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Submitted", count: 2, color: "text-info" },
          { label: "Paid", count: 2, color: "text-success" },
          { label: "Pending", count: 1, color: "text-warning" },
          { label: "Rejected", count: 1, color: "text-destructive" },
          { label: "Appealed", count: 1, color: "text-chart-4" },
        ].map((s) => (
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold font-heading ${s.color}`}>{s.count}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t} className="capitalize text-xs">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search claims..." className="pl-10 h-8 text-sm" />
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Patient</th>
                <th>Insurance</th>
                <th>Procedure</th>
                <th>Amount</th>
                <th>Month</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium text-primary">{c.id}</td>
                  <td>{c.patient}</td>
                  <td>{c.insurance}</td>
                  <td>{c.procedure}</td>
                  <td className="font-semibold">{c.amount}</td>
                  <td className="text-muted-foreground">{c.month}</td>
                  <td>
                    <Badge variant="outline" className={statusStyles[c.status]}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tabs>
    </div>
  );
}
