import { useState } from "react";
import { Plus, Search, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PreAuthForm from "@/components/preauth/PreAuthForm";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

const statusStyles: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PreAuthorization() {
  const [showForm, setShowForm] = useState(false);
  const { data: preauths, isLoading } = useSupabaseQuery("pre_authorizations");
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: procedures } = useSupabaseQuery("procedures");
  const [search, setSearch] = useState("");

  const getPatientName = (id: string) => (patients || []).find((p: any) => p.id === id)?.patient_name || "—";
  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";
  const getProcedureName = (id: string) => (procedures || []).find((p: any) => p.id === id)?.procedure_name || "—";

  if (showForm) {
    return <PreAuthForm onBack={() => setShowForm(false)} />;
  }

  const filtered = (preauths || []).filter((pa: any) =>
    getPatientName(pa.patient_id).toLowerCase().includes(search.toLowerCase()) ||
    getInsurerName(pa.insurance_company_id).toLowerCase().includes(search.toLowerCase())
  );

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading">{(preauths || []).length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Requests</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-success">{(preauths || []).filter((p: any) => p.status === "approved").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Approved</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-warning">{(preauths || []).filter((p: any) => p.status === "pending").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-bold font-heading text-destructive">{(preauths || []).filter((p: any) => p.status === "rejected").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Rejected</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by patient or insurance..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Insurance</th>
                <th>Procedure</th>
                <th>Total Cost</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pa: any) => (
                <tr key={pa.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{getPatientName(pa.patient_id)}</td>
                  <td>{getInsurerName(pa.insurance_company_id)}</td>
                  <td>{getProcedureName(pa.procedure_id)}</td>
                  <td className="font-semibold">GH¢ {Number(pa.total_cost || 0).toLocaleString()}</td>
                  <td>
                    <Badge variant="outline" className={statusStyles[pa.status] || ""}>
                      {pa.status}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">{pa.procedure_date || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No pre-authorizations. Click "New Request" to create one.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
