import { useState, useMemo } from "react";
import { Plus, Search, Pencil, Trash2, Copy, Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import MultiDiagnosisPicker from "@/components/shared/MultiDiagnosisPicker";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete } from "@/hooks/useSupabaseQuery";
import { toast } from "@/hooks/use-toast";
import { useMasterSearch } from "@/hooks/useMasterSearch";

interface TemplateItem {
  description: string;
  quantity: number;
  unitCharge: number;
}

export default function ProcedureTemplates() {
  const { data: templates, isLoading } = useSupabaseQuery("procedure_templates");
  const { data: procedures } = useSupabaseQuery("procedures");
  const insertMutation = useSupabaseInsert("procedure_templates");
  const updateMutation = useSupabaseUpdate("procedure_templates");
  const deleteMutation = useSupabaseDelete("procedure_templates");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ template_name: "", procedure_id: "", notes: "" });
  const [diagnosisIds, setDiagnosisIds] = useState<string[]>([]);
  const [items, setItems] = useState<TemplateItem[]>([{ description: "", quantity: 1, unitCharge: 0 }]);

  const totalAmount = useMemo(
    () => items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCharge) || 0), 0),
    [items],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ template_name: "", procedure_id: "", notes: "" });
    setDiagnosisIds([]);
    setItems([{ description: "", quantity: 1, unitCharge: 0 }]);
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({ template_name: t.template_name, procedure_id: t.procedure_id || "", notes: t.notes || "" });
    setDiagnosisIds([...(t.diagnosis_code_ids || []), ...(t.diagnosis_code_id ? [t.diagnosis_code_id] : [])].filter((v, i, a) => v && a.indexOf(v) === i));
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
    const cleaned = items.filter(i => i.description);
    const payload = {
      template_name: form.template_name,
      procedure_id: form.procedure_id || null,
      diagnosis_code_id: diagnosisIds[0] || null,
      diagnosis_code_ids: diagnosisIds,
      items: cleaned,
      total_amount: cleaned.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCharge) || 0), 0),
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Template updated" });
      } else {
        await insertMutation.mutateAsync({ ...payload, archived: false });
        toast({ title: "Template created" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this template?")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Template deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleDuplicate = async (t: any) => {
    try {
      const { id, created_at, updated_at, ...rest } = t;
      await insertMutation.mutateAsync({ ...rest, template_name: `${t.template_name} (Copy)`, archived: false });
      toast({ title: "Template duplicated" });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleToggleArchive = async (t: any) => {
    try { await updateMutation.mutateAsync({ id: t.id, archived: !t.archived }); toast({ title: t.archived ? "Restored" : "Archived" }); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const getProcName = (id: string) => (procedures || []).find((p: any) => p.id === id)?.procedure_name || "—";

  const searchable = useMasterSearch("procedure_templates", ["template_name", "description"], search, templates as any[]);
  const filtered = (searchable || []).filter((t: any) => {
    if (showArchived ? !t.archived : !!t.archived) return false;
    return t.template_name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Procedure Templates</h1>
          <p className="page-description">Reusable cost-item bundles with diagnoses, auto totals, and lifecycle management</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />New Template</Button>
      </div>

      <div className="stat-card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search templates..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Showing Archived" : "Show Archived"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No templates here.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Template Name</th><th>Procedure</th><th>Diagnoses</th><th>Items</th><th>Total (GH¢)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((t: any) => {
                const itemCount = Array.isArray(t.items) ? t.items.length : 0;
                const diagCount = (t.diagnosis_code_ids || []).length || (t.diagnosis_code_id ? 1 : 0);
                return (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                    <td className="font-medium">{t.template_name}</td>
                    <td className="text-muted-foreground">{getProcName(t.procedure_id)}</td>
                    <td><Badge variant="outline">{diagCount} dx</Badge></td>
                    <td>{itemCount} items</td>
                    <td className="font-semibold">{Number(t.total_amount || 0).toLocaleString()}</td>
                    <td>{t.archived ? <Badge variant="outline" className="bg-muted">Archived</Badge> : <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => handleDuplicate(t)} className="p-1.5 rounded hover:bg-muted" title="Duplicate"><Copy className="w-4 h-4 text-info" /></button>
                        <button onClick={() => handleToggleArchive(t)} className="p-1.5 rounded hover:bg-muted" title={t.archived ? "Restore" : "Archive"}>
                          {t.archived ? <ArchiveRestore className="w-4 h-4 text-info" /> : <Archive className="w-4 h-4 text-warning" />}
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-destructive/10" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></button>
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
          <MultiDiagnosisPicker value={diagnosisIds} onChange={setDiagnosisIds} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cost Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, unitCharge: 0 }])}>+ Item</Button>
            </div>
            <div className="grid grid-cols-[1fr_70px_100px_100px_30px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Description</span><span>Qty</span><span>Unit (GH¢)</span><span className="text-right">Line Total</span><span></span>
            </div>
            {items.map((item, i) => {
              const line = (Number(item.quantity) || 0) * (Number(item.unitCharge) || 0);
              return (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_30px] gap-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => { const n = [...items]; n[i].description = e.target.value; setItems(n); }} className="h-8" />
                  <Input type="number" min="1" value={item.quantity} onChange={(e) => { const n = [...items]; n[i].quantity = parseInt(e.target.value) || 1; setItems(n); }} className="h-8" />
                  <Input type="number" step="0.01" min="0" value={item.unitCharge} onChange={(e) => { const n = [...items]; n[i].unitCharge = parseFloat(e.target.value) || 0; setItems(n); }} className="h-8" />
                  <div className="text-right font-semibold text-sm">{line.toLocaleString()}</div>
                  <button type="button" onClick={() => { if (items.length > 1) setItems(items.filter((_, j) => j !== i)); }} className="text-destructive text-xs">✕</button>
                </div>
              );
            })}
            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-sm">Total: <span className="font-bold text-primary text-base">GH¢ {totalAmount.toLocaleString()}</span></div>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1" />
          </div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Template" : "Create Template"}
          </Button>
        </form>
      </EntityDialog>
    </div>
  );
}
