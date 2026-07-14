import { useState } from "react";
import { Plus, Search, Pencil, Trash2, Upload, Package, Archive, ArchiveRestore } from "lucide-react";
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
import { localDuplicate } from "@/lib/dedupCheck";
import { useMasterSearch } from "@/hooks/useMasterSearch";

const importColumns = [
  { key: "item_name", label: "Item Name", required: true },
  { key: "unit_price", label: "Unit Price (GH¢)", required: true },
  { key: "category", label: "Category" },
];

export default function CatalogItems() {
  const { data: items, isLoading } = useSupabaseQuery("preauth_catalog_items");
  const insertMutation = useSupabaseInsert("preauth_catalog_items");
  const updateMutation = useSupabaseUpdate("preauth_catalog_items");
  const deleteMutation = useSupabaseDelete("preauth_catalog_items");
  const bulkInsert = useSupabaseBulkInsert("preauth_catalog_items");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ item_name: "", unit_price: "", category: "" });
  const searchable = useMasterSearch("preauth_catalog_items", ["item_name", "category"], search, items as any[]);

  const openNew = () => { setEditing(null); setForm({ item_name: "", unit_price: "", category: "" }); setDialogOpen(true); };
  const openEdit = (i: any) => { setEditing(i); setForm({ item_name: i.item_name, unit_price: String(i.unit_price), category: i.category || "" }); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { item_name: form.item_name, unit_price: parseFloat(form.unit_price) || 0, category: form.category || null };
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Item updated" });
      } else {
        const dup = localDuplicate(payload, items || [], ["item_name"]);
        if (dup) { toast({ title: "Duplicate detected", description: "An item with this name already exists.", variant: "destructive" }); return; }
        await insertMutation.mutateAsync(payload);
        toast({ title: "Item added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleArchive = async (item: any) => {
    try {
      await updateMutation.mutateAsync({ id: item.id, archived: !item.archived });
      toast({ title: item.archived ? "Item restored" : "Item archived" });
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this item? Consider archiving instead.")) return;
    try { await deleteMutation.mutateAsync(id); toast({ title: "Item deleted" }); } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const filtered = (searchable || [])
    .filter((i: any) => showArchived ? i.archived : !i.archived)
    .filter((i: any) =>
      i.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Package className="w-6 h-6 text-primary" />Cost Breakdown Catalog</h1>
          <p className="page-description">Manage reusable items for pre-authorization cost breakdowns. Duplicates are automatically rejected on import.</p>
        </div>
        <div className="flex gap-2">
          <DownloadTemplate columns={importColumns} fileName="catalog-items-template" />
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />Import</Button>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Item</Button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search items..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)} className="gap-2">
            <Archive className="w-4 h-4" />{showArchived ? "Viewing Archived" : "View Archived"}
          </Button>
          <span className="text-xs text-muted-foreground">{filtered.length} items</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Item Name</th><th>Unit Price (GH¢)</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((i: any) => (
                <tr key={i.id} className="hover:bg-muted/50 transition-colors">
                  <td className="font-medium">{i.item_name}</td>
                  <td className="font-semibold">GH¢ {Number(i.unit_price).toLocaleString()}</td>
                  <td className="text-muted-foreground">{i.category || "—"}</td>
                  <td>{i.archived ? <Badge variant="outline" className="text-muted-foreground">Archived</Badge> : <Badge className="bg-success/10 text-success border-success/20">Active</Badge>}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(i)} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => handleArchive(i)} className="p-1.5 rounded hover:bg-muted" title={i.archived ? "Restore" : "Archive"}>
                        {i.archived ? <ArchiveRestore className="w-4 h-4 text-success" /> : <Archive className="w-4 h-4 text-warning" />}
                      </button>
                      <button onClick={() => handleDelete(i.id)} className="p-1.5 rounded hover:bg-destructive/10" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No {showArchived ? "archived" : ""} catalog items.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? "Edit Catalog Item" : "Add Catalog Item"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Item Name *</Label><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required className="mt-1" placeholder="e.g. Consultation Fee" /></div>
          <div><Label>Unit Price (GH¢) *</Label><Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} required className="mt-1" /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1" placeholder="e.g. Consultation, Lab, Surgery" /></div>
          <Button type="submit" className="w-full" disabled={insertMutation.isPending || updateMutation.isPending}>
            {editing ? "Update Item" : "Add Item"}
          </Button>
        </form>
      </EntityDialog>

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Catalog Items"
        columns={importColumns}
        onImport={async (rows) => {
          const existing = items || [];
          const toInsert: any[] = [];
          let skipped = 0;
          for (const r of rows) {
            const payload = {
              item_name: String(r.item_name || "").trim(),
              unit_price: parseFloat(r.unit_price) || 0,
              category: r.category ? String(r.category).trim() : null,
            };
            if (!payload.item_name) { skipped++; continue; }
            const dup = localDuplicate(payload, [...existing, ...toInsert], ["item_name"]);
            if (dup) { skipped++; continue; }
            toInsert.push(payload);
          }
          if (toInsert.length > 0) await bulkInsert.mutateAsync(toInsert);
          toast({
            title: "Import complete",
            description: `${toInsert.length} added, ${skipped} duplicate(s)/invalid rejected.`,
          });
        }}
      />
    </div>
  );
}
