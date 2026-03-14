import { useState } from "react";
import { Plus, Search, Stethoscope, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete, useSupabaseBulkInsert } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

export default function Doctors() {
  const { data: doctors, isLoading } = useSupabaseQuery("doctors");
  const insertMutation = useSupabaseInsert("doctors");
  const updateMutation = useSupabaseUpdate("doctors");
  const deleteMutation = useSupabaseDelete("doctors");
  const bulkInsert = useSupabaseBulkInsert("doctors");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ doctor_name: "", specialty: "", hospital: "", contact: "" });

  const openNew = () => { setEditingDoctor(null); setForm({ doctor_name: "", specialty: "", hospital: "", contact: "" }); setDialogOpen(true); };
  const openEdit = (d: any) => { setEditingDoctor(d); setForm({ doctor_name: d.doctor_name, specialty: d.specialty || "", hospital: d.hospital || "", contact: d.contact || "" }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDoctor) {
        await updateMutation.mutateAsync({ id: editingDoctor.id, ...form });
        toast({ title: "Doctor updated" });
      } else {
        await insertMutation.mutateAsync(form);
        toast({ title: "Doctor added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this doctor?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Doctor deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const filtered = (doctors || []).filter((d: any) =>
    d.doctor_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Doctors</h1>
          <p className="page-description">Manage registered doctors and their specialties</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Doctor</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search doctors..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No doctors found. Click "Add Doctor" to create one.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Doctor</th><th>Specialty</th><th>Hospital</th><th>Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium flex items-center gap-2"><Stethoscope className="w-4 h-4 text-primary" />{d.doctor_name}</td>
                  <td><Badge variant="secondary">{d.specialty || "—"}</Badge></td>
                  <td className="text-muted-foreground">{d.hospital || "—"}</td>
                  <td className="text-muted-foreground">{d.contact || "—"}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editingDoctor ? "Edit Doctor" : "Add Doctor"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Doctor Name *</Label><Input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} required className="mt-1" /></div>
          <div><Label>Specialty</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="mt-1" /></div>
          <div><Label>Hospital</Label><Input value={form.hospital} onChange={(e) => setForm({ ...form, hospital: e.target.value })} className="mt-1" /></div>
          <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="mt-1" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editingDoctor ? "Update Doctor" : "Add Doctor"}
          </Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Doctors"
        columns={[
          { key: "doctor_name", label: "Doctor Name", required: true },
          { key: "specialty", label: "Specialty" },
          { key: "hospital", label: "Hospital" },
          { key: "contact", label: "Contact" },
        ]}
        onImport={async (rows) => { await bulkInsert.mutateAsync(rows); }}
      />
    </div>
  );
}
