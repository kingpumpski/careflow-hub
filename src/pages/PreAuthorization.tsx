import { useState } from "react";
import { Plus, Search, Eye, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PreAuthForm from "@/components/preauth/PreAuthForm";
import { useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import EntityDialog from "@/components/shared/EntityDialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { exportPreAuthPDF } from "@/lib/exportUtils";

const statusStyles: Record<string, string> = {
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PreAuthorization() {
  const [showForm, setShowForm] = useState(false);
  const [editingPreauth, setEditingPreauth] = useState<any>(null);
  const [viewPreauth, setViewPreauth] = useState<any>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({ id: "", status: "" });

  const { data: preauths, isLoading } = useSupabaseQuery("pre_authorizations");
  const { data: patients } = useSupabaseQuery("patients");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: doctors } = useSupabaseQuery("doctors");
  const { data: settings } = useSupabaseQuery("system_settings");
  const updateMutation = useSupabaseUpdate("pre_authorizations");
  const [search, setSearch] = useState("");

  const getPatientName = (id: string) => (patients || []).find((p: any) => p.id === id)?.patient_name || "—";
  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";
  const getProcedureName = (id: string) => (procedures || []).find((p: any) => p.id === id)?.procedure_name || "—";
  const getDoctorName = (id: string) => (doctors || []).find((d: any) => d.id === id)?.doctor_name || "—";

  const companyInfo = {
    provider_name: settings?.find?.((s: any) => s.key === "provider_name")?.value || "",
    provider_address: settings?.find?.((s: any) => s.key === "provider_address")?.value || "",
    provider_phone: settings?.find?.((s: any) => s.key === "provider_phone")?.value || "",
  };

  const handleView = async (pa: any) => {
    setViewPreauth(pa);
    const { data } = await (supabase.from("preauth_items") as any).select("*").eq("preauth_id", pa.id);
    setViewItems(data || []);
  };

  const handleExportPDF = () => {
    if (!viewPreauth) return;
    exportPreAuthPDF({
      ...viewPreauth,
      patient_name: getPatientName(viewPreauth.patient_id),
      insurance_name: getInsurerName(viewPreauth.insurance_company_id),
      doctor_name: getDoctorName(viewPreauth.doctor_id),
    }, viewItems, companyInfo);
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({ id: statusForm.id, status: statusForm.status });
      toast({ title: "Status updated" });
      setStatusDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (showForm || editingPreauth) {
    return <PreAuthForm onBack={() => { setShowForm(false); setEditingPreauth(null); }} editData={editingPreauth} />;
  }

  // View detail
  if (viewPreauth) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setViewPreauth(null)}>← Back</Button>
          <div className="flex-1">
            <h1 className="page-title">Pre-Authorization Details</h1>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportPDF}><Download className="w-4 h-4" />Export PDF</Button>
          <Button className="gap-2" onClick={() => { setViewPreauth(null); setEditingPreauth(viewPreauth); }}><Pencil className="w-4 h-4" />Edit</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="stat-card"><p className="text-xs text-muted-foreground">Patient</p><p className="font-semibold mt-1">{getPatientName(viewPreauth.patient_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Insurance</p><p className="font-semibold mt-1">{getInsurerName(viewPreauth.insurance_company_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Doctor</p><p className="font-semibold mt-1">{getDoctorName(viewPreauth.doctor_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Procedure</p><p className="font-semibold mt-1">{getProcedureName(viewPreauth.procedure_id)}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Diagnosis</p><p className="font-semibold mt-1">{viewPreauth.diagnosis || "—"}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Status</p>
            <Badge variant="outline" className={`mt-1 ${statusStyles[viewPreauth.status] || ""}`}>{viewPreauth.status}</Badge>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Cost Breakdown</h3>
          <table className="data-table">
            <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price (GH¢)</th><th>Amount (GH¢)</th></tr></thead>
            <tbody>
              {viewItems.map((item: any, i: number) => (
                <tr key={item.id}>
                  <td>{i + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{Number(item.unit_price).toLocaleString()}</td>
                  <td className="font-semibold">{Number(item.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="text-right">Total</td>
                <td className="text-primary">GH¢ {Number(viewPreauth.total_cost || 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setStatusForm({ id: viewPreauth.id, status: viewPreauth.status }); setStatusDialogOpen(true); }}>
            Update Status
          </Button>
        </div>

        <EntityDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen} title="Update Status">
          <form onSubmit={handleStatusUpdate} className="space-y-4">
            <div>
              <Label>Status</Label>
              <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>Update</Button>
          </form>
        </EntityDialog>
      </div>
    );
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
          <Plus className="w-4 h-4" />New Request
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
                <th>Actions</th>
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
                    <Badge variant="outline" className={statusStyles[pa.status] || ""}>{pa.status}</Badge>
                  </td>
                  <td className="text-muted-foreground">{pa.procedure_date || "—"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleView(pa)} className="p-1.5 rounded hover:bg-muted"><Eye className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => setEditingPreauth(pa)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No pre-authorizations. Click "New Request" to create one.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
