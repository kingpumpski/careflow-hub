import { useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";

interface TemplateItem {
  description: string;
  quantity: number;
  unitCharge: number;
}

export default function ProcedureTemplates() {
  const { data: templates, isLoading } = useSupabaseQuery("procedure_templates");
  const { data: procedures } = useSupabaseQuery("procedures");
  const { data: diagnosisCodes } = useSupabaseQuery("diagnosis_codes");
  const insertMutation = useSupabaseInsert("procedure_templates");
  const updateMutation = useSupabaseUpdate("procedure_templates");
  const deleteMutation = useSupabaseDelete("procedure_templates");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ template_name: "", procedure_id: "", diagnosis_code_id: "" });
  const [items, setItems] = useState<TemplateItem[]>([{ description: "", quantity: 1, unitCharge: 0 }]);

  const openNew = () => {
    setEditing(null);
    setForm({ template_name: "", procedure_id: "", diagnosis_code_id: "" });
    setItems([{ description: "", quantity: 1, unitCharge: 0 }]);
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({ template_name: t.template_name, procedure_id: t.procedure_id || "", diagnosis_code_id: t.diagnosis_code_id || "" });
    try {
      const parsed = typeof t.items === "string" ? JSON.parse(t.items) : t.items;
      setItems(Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ description: "", quantity: 1, unitCharge: 0 }]);
    } catch {
      setItems([{ description: "", quantity: 1, unitCharge: 0 }]);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      template_name: form.template_name,
      procedure_id: form.procedure_id || null,
      diagnosis_code_id: form.diagnosis_code_id || null,
      items: items.filter(i => i.description),
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Template updated" });
      } else {
        await insertMutation.mutateAsync(payload);
        toast({ title: "Template created" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Template deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const getProcName = (id: string) => (procedures || []).find((p: any) => p.id === id)?.procedure_name || "—";
  const getDiagName = (id: string) => {
    const d = (diagnosisCodes || []).find((d: any) => d.id === id);
    return d ? `${d.code} - ${d.description}` : "—";
  };

  const filtered = (templates || []).filter((t: any) =>
    t.template_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Procedure Templates</h1>
          <p className="page-description">Create reusable templates to speed up pre-authorization requests</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />New Template</Button>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search templates..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No templates. Create one to speed up pre-authorizations.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Template Name</th><th>Procedure</th><th>Diagnosis</th><th>Items</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((t: any) => {
                const itemCount = Array.isArray(t.items) ? t.items.length : 0;
                return (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                    <td className="font-medium">{t.template_name}</td>
                    <td className="text-muted-foreground">{getProcName(t.procedure_id)}</td>
                    <td className="text-muted-foreground text-xs">{getDiagName(t.diagnosis_code_id)}</td>
                    <td>{itemCount} items</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Template" : "Create Template"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Template Name *</Label><Input value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} required className="mt-1" /></div>
          <div>
            <Label>Procedure</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.procedure_id} onChange={(e) => setForm({ ...form, procedure_id: e.target.value })}>
              <option value="">Select procedure...</option>
              {(procedures || []).map((p: any) => <option key={p.id} value={p.id}>{p.procedure_name}</option>)}
            </select>
          </div>
          <div>
            <Label>Diagnosis (ICD-10)</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.diagnosis_code_id} onChange={(e) => setForm({ ...form, diagnosis_code_id: e.target.value })}>
              <option value="">Select diagnosis...</option>
              {(diagnosisCodes || []).map((d: any) => <option key={d.id} value={d.id}>{d.code} — {d.description}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Template Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, unitCharge: 0 }])}>+ Item</Button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_80px_30px] gap-2 items-center">
                <Input placeholder="Description" value={item.description} onChange={(e) => { const n = [...items]; n[i].description = e.target.value; setItems(n); }} className="h-8" />
                <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => { const n = [...items]; n[i].quantity = parseInt(e.target.value) || 1; setItems(n); }} className="h-8" />
                <Input type="number" placeholder="Price" value={item.unitCharge} onChange={(e) => { const n = [...items]; n[i].unitCharge = parseFloat(e.target.value) || 0; setItems(n); }} className="h-8" />
                <button type="button" onClick={() => { if (items.length > 1) setItems(items.filter((_, j) => j !== i)); }} className="text-destructive text-xs">✕</button>
              </div>
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Template" : "Create Template"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
