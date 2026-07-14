import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";
import { useMasterSearch } from "@/hooks/useMasterSearch";

const categoryColors: Record<string, string> = {
  Radiology: "bg-info/10 text-info",
  Laboratory: "bg-accent/10 text-accent",
  Surgery: "bg-destructive/10 text-destructive",
  Consultation: "bg-primary/10 text-primary",
  Dental: "bg-warning/10 text-warning",
  Cardiology: "bg-chart-4/10 text-chart-4",
  Physiotherapy: "bg-success/10 text-success",
  Pharmacy: "bg-chart-3/10 text-chart-3",
};

export default function Procedures() {
  const { data: procedures, isLoading } = useSupabaseQuery("procedures");
  const insertMutation = useSupabaseInsert("procedures");
  const updateMutation = useSupabaseUpdate("procedures");
  const deleteMutation = useSupabaseDelete("procedures");
  const bulkInsert = useSupabaseBulkInsert("procedures");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ procedure_name: "", procedure_code: "", default_tariff: "", category: "", description: "" });
  const searchable = useMasterSearch("procedures", ["procedure_name", "procedure_code", "category", "description"], search, procedures as any[]);

  const openNew = () => { setEditing(null); setForm({ procedure_name: "", procedure_code: "", default_tariff: "", category: "", description: "" }); setDialogOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ procedure_name: p.procedure_name, procedure_code: p.procedure_code || "", default_tariff: String(p.default_tariff), category: p.category || "", description: p.description || "" }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, default_tariff: parseFloat(form.default_tariff) || 0, procedure_code: form.procedure_code || null };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Procedure updated" });
      } else {
        await insertMutation.mutateAsync(payload);
        toast({ title: "Procedure added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this procedure?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Procedure deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const filtered = (searchable || []).filter((p: any) =>
    p.procedure_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.procedure_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Procedure Tariffs</h1>
          <p className="page-description">Manage medical procedures and their standard tariffs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Procedure</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search procedures..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No procedures found. Click "Add Procedure" to create one.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Procedure Name</th><th>Category</th><th>Tariff (GH¢)</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-mono text-xs font-medium">{p.procedure_code || "—"}</td>
                  <td className="font-medium">{p.procedure_name}</td>
                  <td><Badge variant="secondary" className={categoryColors[p.category] || ""}>{p.category || "—"}</Badge></td>
                  <td className="font-semibold">{Number(p.default_tariff).toLocaleString()}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Procedure" : "Add Procedure"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Procedure Name *</Label><Input value={form.procedure_name} onChange={(e) => setForm({ ...form, procedure_name: e.target.value })} required className="mt-1" /></div>
          <div><Label>Code</Label><Input value={form.procedure_code} onChange={(e) => setForm({ ...form, procedure_code: e.target.value })} placeholder="e.g. MRI-001" className="mt-1" /></div>
          <div><Label>Default Tariff (GH¢) *</Label><Input type="number" value={form.default_tariff} onChange={(e) => setForm({ ...form, default_tariff: e.target.value })} required className="mt-1" /></div>
          <div>
            <Label>Category</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Select category...</option>
              {["Radiology", "Laboratory", "Surgery", "Consultation", "Dental", "Cardiology", "Physiotherapy", "Pharmacy", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Procedure" : "Add Procedure"}
          </Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Procedure Tariffs"
        columns={[
          { key: "procedure_name", label: "Procedure Name", required: true },
          { key: "procedure_code", label: "Code" },
          { key: "default_tariff", label: "Tariff" },
          { key: "category", label: "Category" },
          { key: "description", label: "Description" },
        ]}
        onImport={async (rows) => {
          const parsed = rows.map(r => ({
            ...r,
            default_tariff: parseFloat(r.default_tariff) || 0,
          }));
          await bulkInsert.mutateAsync(parsed);
        }}
      />
    </div>
  );
}
