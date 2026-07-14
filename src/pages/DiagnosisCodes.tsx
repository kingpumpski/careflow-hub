import { useState, useMemo } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, Trash2, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import BulkImportDialog from "@/components/shared/BulkImportDialog";
import DownloadTemplate from "@/components/shared/DownloadTemplate";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { aiDuplicateCheck, localDuplicate } from "@/lib/dedupCheck";
import { useMasterSearch } from "@/hooks/useMasterSearch";

const ICD_CATEGORIES = [
  "Infectious & Parasitic", "Neoplasms", "Blood & Immune", "Endocrine & Metabolic",
  "Mental & Behavioral", "Nervous System", "Eye & Adnexa", "Ear & Mastoid",
  "Circulatory", "Respiratory", "Digestive", "Skin & Subcutaneous",
  "Musculoskeletal", "Genitourinary", "Pregnancy & Childbirth", "Perinatal",
  "Congenital", "Symptoms & Signs", "Injury & Poisoning", "External Causes", "Other",
];

export default function DiagnosisCodes() {
  const { data: codes, isLoading } = useSupabaseQuery("diagnosis_codes", { orderBy: "code" });
  const insertM = useSupabaseInsert("diagnosis_codes");
  const updateM = useSupabaseUpdate("diagnosis_codes");
  const deleteM = useSupabaseDelete("diagnosis_codes");

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: "", description: "", category: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [aiHint, setAiHint] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);

  const openNew = () => { setEditing(null); setForm({ code: "", description: "", category: "" }); setDialogOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ code: c.code || "", description: c.description || "", category: c.category || "" }); setDialogOpen(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editing) {
        // Real-time duplicate scrutiny
        const exact = localDuplicate(form, codes || [], ["code"]);
        if (exact) {
          toast({ title: "Duplicate ICD-10 code", description: `Code ${form.code} already exists.`, variant: "destructive" });
          return;
        }
        const ai = await aiDuplicateCheck("diagnosis", form, (codes || []) as any);
        if (ai.duplicate && ai.confidence >= 0.75) {
          if (!confirm(`AI flagged this as a possible duplicate: ${ai.reason}\n\nSave anyway?`)) return;
        }
      }
      if (editing) await updateM.mutateAsync({ id: editing.id, ...form });
      else await insertM.mutateAsync({ ...form, archived: false });
      toast({ title: editing ? "Diagnosis updated" : "Diagnosis added" });
      setDialogOpen(false);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const runAiHint = async () => {
    if (!form.code && !form.description) { setAiHint(""); return; }
    setAiBusy(true);
    const ai = await aiDuplicateCheck("diagnosis", form, (codes || []) as any);
    setAiHint(ai.duplicate ? `⚠ Possible duplicate (${Math.round(ai.confidence * 100)}%): ${ai.reason}` : "✓ No similar code found.");
    setAiBusy(false);
  };

  const handleBulkImport = async (rows: Record<string, any>[]) => {
    const existing = codes || [];
    const seen = new Map<string, any>();
    (existing as any[]).forEach((c) => seen.set(String(c.code || "").trim().toUpperCase(), c));

    let created = 0, updated = 0, skipped = 0, archived = 0;
    for (const r of rows) {
      const code = String(r.code || "").trim().toUpperCase();
      if (!code || !r.description) { skipped++; continue; }
      const candidate = { code, description: String(r.description).trim(), category: r.category || null, archived: false };
      const existingRow = seen.get(code);
      if (existingRow) {
        const sameDesc = String(existingRow.description || "").trim().toLowerCase() === candidate.description.toLowerCase();
        if (sameDesc) { skipped++; continue; }
        // Archive old, insert new (treat as overwrite)
        await (supabase.from("diagnosis_codes") as any).update({ archived: true }).eq("id", existingRow.id);
        const { data: ins } = await (supabase.from("diagnosis_codes") as any).insert(candidate).select().single();
        if (ins) seen.set(code, ins);
        archived++; updated++;
      } else {
        const { data: ins } = await (supabase.from("diagnosis_codes") as any).insert(candidate).select().single();
        if (ins) seen.set(code, ins);
        created++;
      }
    }
    toast({ title: "Import complete", description: `Created ${created} · Updated ${updated} · Archived ${archived} · Skipped ${skipped}` });
  };

  const toggleArchive = async (c: any) => {
    try { await updateM.mutateAsync({ id: c.id, archived: !c.archived }); toast({ title: c.archived ? "Restored" : "Archived" }); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this diagnosis code?")) return;
    try { await deleteM.mutateAsync(id); toast({ title: "Deleted" }); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const filtered = useMemo(() => {
    const t = search.toLowerCase().trim();
    const source = searchable;
    return (source || []).filter((c: any) => {
      if (!showArchived && c.archived) return false;
      if (showArchived && !c.archived) return false;
      if (!t) return true;
      return c.code?.toLowerCase().includes(t) || c.description?.toLowerCase().includes(t) || c.category?.toLowerCase?.().includes(t);
    });
  }, [searchable, search, showArchived]);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Diagnosis Master (ICD-10)</h1>
          <p className="page-description">Central database for ICD-10 codes used across pre-authorizations and claims</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadTemplate columns={[{ key: "code", label: "code" }, { key: "description", label: "description" }, { key: "category", label: "category" }]} fileName="diagnosis_codes_template" />
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Bulk Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />New Diagnosis</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search code, description, category..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Showing Archived" : "Show Archived"}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} record(s)</span>
        </div>

        {isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <table className="data-table">
            <thead><tr><th>Code</th><th>Description</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className="font-mono text-sm font-medium">{c.code}</td>
                  <td>{c.description}</td>
                  <td className="text-muted-foreground text-sm">{c.category || "—"}</td>
                  <td>{c.archived ? <Badge variant="outline" className="bg-muted">Archived</Badge> : <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => toggleArchive(c)} className="p-1.5 rounded hover:bg-muted" title={c.archived ? "Restore" : "Archive"}>
                        {c.archived ? <ArchiveRestore className="w-4 h-4 text-info" /> : <Archive className="w-4 h-4 text-warning" />}
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No records found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Diagnosis" : "Add Diagnosis"}>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>ICD-10 Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required className="mt-1 font-mono" placeholder="e.g. A09.0" /></div>
          <div><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="mt-1" /></div>
          <div>
            <Label>Category</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">— Select —</option>
              {ICD_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          {!editing && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={aiHint.startsWith("⚠") ? "text-warning" : "text-muted-foreground"}>{aiHint || "AI duplicate scrutiny available."}</span>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={runAiHint} disabled={aiBusy}>
                <Sparkles className="w-3 h-3" />{aiBusy ? "Checking..." : "AI Check"}
              </Button>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={insertM.isPending || updateM.isPending}>{editing ? "Update" : "Save"}</Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Bulk Import ICD-10 Codes"
        columns={[{ key: "code", label: "code", required: true }, { key: "description", label: "description", required: true }, { key: "category", label: "category" }]}
        onImport={handleBulkImport}
      />
    </div>
  );
}