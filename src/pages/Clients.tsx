import { useState } from "react";
import { Plus, Search, Building2, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

export default function Clients() {
  const { data: clients, isLoading } = useSupabaseQuery("client_companies");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const insertMutation = useSupabaseInsert("client_companies");
  const updateMutation = useSupabaseUpdate("client_companies");
  const deleteMutation = useSupabaseDelete("client_companies");
  const bulkInsert = useSupabaseBulkInsert("client_companies");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ company_name: "", insurance_company_id: "", contact_person: "", email: "", phone: "" });

  const openNew = () => { setEditing(null); setForm({ company_name: "", insurance_company_id: "", contact_person: "", email: "", phone: "" }); setDialogOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ company_name: c.company_name, insurance_company_id: c.insurance_company_id || "", contact_person: c.contact_person || "", email: c.email || "", phone: c.phone || "" }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, insurance_company_id: form.insurance_company_id || null };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Client updated" });
      } else {
        await insertMutation.mutateAsync(payload);
        toast({ title: "Client added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Client deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";
  const filtered = (clients || []).filter((c: any) => c.company_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Client Companies</h1>
          <p className="page-description">Manage registered client companies and their insurance mappings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Client</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search clients..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No clients found. Click "Add Client" to create one.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Company</th><th>Insurance Partner</th><th>Contact</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />{c.company_name}</td>
                  <td>{getInsurerName(c.insurance_company_id)}</td>
                  <td>{c.contact_person || "—"}</td>
                  <td className="text-muted-foreground">{c.email || "—"}</td>
                  <td className="text-muted-foreground">{c.phone || "—"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Client" : "Add Client"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required className="mt-1" /></div>
          <div>
            <Label>Insurance Partner</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.insurance_company_id} onChange={(e) => setForm({ ...form, insurance_company_id: e.target.value })}>
              <option value="">Select insurer...</option>
              {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
            </select>
          </div>
          <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="mt-1" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Client" : "Add Client"}
          </Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Client Companies"
        columns={[
          { key: "company_name", label: "Company Name", required: true },
          { key: "contact_person", label: "Contact Person" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
        ]}
        onImport={async (rows) => { await bulkInsert.mutateAsync(rows); }}
      />
    </div>
  );
}
