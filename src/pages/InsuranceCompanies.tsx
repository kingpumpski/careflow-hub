import { useState } from "react";
import { Plus, Search, Shield, Pencil, Trash2, Upload, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import DownloadTemplate from "@/components/shared/DownloadTemplate";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

const importColumns = [
  { key: "company_name", label: "Company Name", required: true },
  { key: "contact_person", label: "Contact Person" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
];

export default function InsuranceCompanies() {
  const { data: insurers, isLoading } = useSupabaseQuery("insurance_companies");
  const insertMutation = useSupabaseInsert("insurance_companies");
  const updateMutation = useSupabaseUpdate("insurance_companies");
  const deleteMutation = useSupabaseDelete("insurance_companies");
  const bulkInsert = useSupabaseBulkInsert("insurance_companies");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ company_name: "", email: "", phone: "", address: "", contact_person: "", color: "#3b82f6", additional_emails: "" });

  const openNew = () => { setEditing(null); setForm({ company_name: "", email: "", phone: "", address: "", contact_person: "", color: "#3b82f6", additional_emails: "" }); setDialogOpen(true); };
  const openEdit = (i: any) => { setEditing(i); setForm({ company_name: i.company_name, email: i.email || "", phone: i.phone || "", address: i.address || "", contact_person: i.contact_person || "", color: i.color || "#3b82f6", additional_emails: Array.isArray(i.additional_emails) ? i.additional_emails.join(", ") : "" }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const additional_emails = form.additional_emails
        .split(",").map(s => s.trim()).filter(Boolean);
      const payload = { ...form, additional_emails };
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Insurance company updated" });
      } else {
        await insertMutation.mutateAsync(payload);
        toast({ title: "Insurance company added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (ins: any) => {
    try {
      await updateMutation.mutateAsync({ id: ins.id, is_active: !ins.is_active });
      toast({ title: ins.is_active ? "Company deactivated" : "Company reactivated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this insurance company?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Insurance company deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const filtered = (insurers || []).filter((i: any) => {
    const matchSearch = i.company_name?.toLowerCase().includes(search.toLowerCase());
    const matchActive = showInactive ? true : i.is_active !== false;
    return matchSearch && matchActive;
  });

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Insurance Companies</h1>
          <p className="page-description">Manage insurance company partners</p>
        </div>
        <div className="flex gap-2">
          <DownloadTemplate columns={importColumns} fileName="insurance-companies-template" />
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Company</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search companies..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(!showInactive)} className="text-xs gap-1">
            {showInactive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {showInactive ? "Showing All" : "Active Only"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No insurance companies found.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Company</th><th>Status</th><th>Contact Person</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((i: any) => (
                <tr key={i.id} className={`hover:bg-muted/50 transition-colors ${i.is_active === false ? "opacity-50" : ""}`}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: i.color || "#3b82f6" }} />
                      {i.company_name}
                    </div>
                  </td>
                  <td>
                    <Badge variant="outline" className={i.is_active === false ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-success/10 text-success border-success/20"}>
                      {i.is_active === false ? "Inactive" : "Active"}
                    </Badge>
                  </td>
                  <td>{i.contact_person || "—"}</td>
                  <td className="text-muted-foreground">{i.email || "—"}</td>
                  <td className="text-muted-foreground">{i.phone || "—"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggleActive(i)} className="p-1.5 rounded hover:bg-muted" title={i.is_active === false ? "Reactivate" : "Deactivate"}>
                        {i.is_active === false ? <ToggleLeft className="w-4 h-4 text-muted-foreground" /> : <ToggleRight className="w-4 h-4 text-success" />}
                      </button>
                      <button onClick={() => openEdit(i)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(i.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Insurance Company" : "Add Insurance Company"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required className="mt-1" /></div>
          <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="mt-1" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
          <div>
            <Label>Additional / CC Emails (comma-separated)</Label>
            <Input value={form.additional_emails} onChange={(e) => setForm({ ...form, additional_emails: e.target.value })} placeholder="medical@ins.com, ops@ins.com" className="mt-1" />
            <p className="text-[11px] text-muted-foreground mt-1">All addresses listed here will be CC'd on every pre-authorization email.</p>
          </div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Company" : "Add Company"}
          </Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Insurance Companies"
        columns={importColumns}
        onImport={async (rows) => { await bulkInsert.mutateAsync(rows); }}
      />
    </div>
  );
}
