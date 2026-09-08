import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { exportCareFlowWorkbook, importCareFlowWorkbook } from "@/modules/offline/excel-bridge";

export function OfflineDataControls() {
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const filename = await exportCareFlowWorkbook();
      toast({ title: "Backup exported", description: `${filename} was generated from local CareFlow data.` });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message || "Unable to export the workbook.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const importBackup = async (file: File, mode: "merge" | "replace") => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const validations = await importCareFlowWorkbook(buffer, mode);
      const count = validations.reduce((sum, validation) => sum + validation.rows.length, 0);
      toast({ title: "Workbook imported", description: `${count} validated records are now available locally.` });
      window.location.reload();
    } catch (error: any) {
      toast({ title: "Import rejected", description: error.message || "The workbook did not pass validation.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h2 className="font-semibold">Internal data bridge</h2><p className="text-sm text-muted-foreground">IndexedDB is the live local store. Excel is the portable backup and migration format; it is not the live database.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void exportBackup()}><Download className="mr-1 h-4 w-4" />Export backup</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Upload className="mr-1 h-4 w-4" />Merge Excel<input className="hidden" type="file" accept=".xlsx,.xls" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file, "merge"); event.currentTarget.value = ""; }} /></label>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Upload className="mr-1 h-4 w-4" />Replace from Excel<input className="hidden" type="file" accept=".xlsx,.xls" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file, "replace"); event.currentTarget.value = ""; }} /></label>
        </div>
      </div>
    </section>
  );
}
