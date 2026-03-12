import { useState } from "react";
import { Plus, Search, FileText, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import PreAuthForm from "@/components/preauth/PreAuthForm";

const mockPreAuths = [
  { id: "PA-2026-001", patient: "Kwame Asante", insurance: "ACACIA Health", procedure: "MRI Scan", amount: "GH¢ 3,600", status: "approved", date: "2026-03-10" },
  { id: "PA-2026-002", patient: "Ama Mensah", insurance: "ACE Insurance", procedure: "CT Scan", amount: "GH¢ 2,800", status: "pending", date: "2026-03-11" },
  { id: "PA-2026-003", patient: "Yaw Boateng", insurance: "APEX Health", procedure: "X-Ray", amount: "GH¢ 500", status: "approved", date: "2026-03-11" },
  { id: "PA-2026-004", patient: "Efua Darkwa", insurance: "STAR Assurance", procedure: "Blood Test", amount: "GH¢ 350", status: "rejected", date: "2026-03-12" },
  { id: "PA-2026-005", patient: "Kofi Adjei", insurance: "ACACIA Health", procedure: "Ultrasound", amount: "GH¢ 1,200", status: "pending", date: "2026-03-12" },
];

const statusStyles: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PreAuthorization() {
  const [showForm, setShowForm] = useState(false);

  if (showForm) {
    return <PreAuthForm onBack={() => setShowForm(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Pre-Authorization Requests</h1>
          <p className="page-description">Manage insurance approval requests before procedures</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Request
        </Button>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by patient, ID, or insurance..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Patient</th>
              <th>Insurance</th>
              <th>Procedure</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockPreAuths.map((pa) => (
              <tr key={pa.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium text-primary">{pa.id}</td>
                <td>{pa.patient}</td>
                <td>{pa.insurance}</td>
                <td>{pa.procedure}</td>
                <td className="font-semibold">{pa.amount}</td>
                <td>
                  <Badge variant="outline" className={statusStyles[pa.status]}>
                    {pa.status}
                  </Badge>
                </td>
                <td className="text-muted-foreground">{pa.date}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded hover:bg-muted"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                    <button className="p-1.5 rounded hover:bg-muted"><Download className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
