import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import EntityDialog from "./EntityDialog";
import { toast } from "@/hooks/use-toast";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: { key: string; label: string; required?: boolean }[];
  onImport: (rows: Record<string, any>[]) => Promise<void>;
}

export default function BulkImportDialog({ open, onOpenChange, title, columns, onImport }: BulkImportDialogProps) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) { setError("File must have at least a header row and one data row"); return; }

      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
      const parsed: Record<string, any>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
        const row: Record<string, any> = {};
        columns.forEach(col => {
          const idx = headers.findIndex(h =>
            h === col.key.toLowerCase() || h === col.label.toLowerCase() || h.includes(col.key.toLowerCase().replace(/_/g, " "))
          );
          if (idx !== -1 && values[idx]) row[col.key] = values[idx];
        });
        if (Object.keys(row).length > 0) parsed.push(row);
      }

      if (parsed.length === 0) { setError("No valid data rows found. Check column headers match expected format."); return; }
      setRows(parsed);
    } catch (err: any) {
      setError("Failed to parse file: " + err.message);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(rows);
      toast({ title: "Import successful", description: `${rows.length} records imported` });
      setRows([]);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <EntityDialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <div>
          <Label>Upload CSV File</Label>
          <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">CSV format with headers</p>
            <p className="text-xs text-muted-foreground mb-3">
              Expected columns: {columns.map(c => c.label).join(", ")}
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />Choose File
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">{rows.length} records ready to import</p>
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              <table className="data-table text-xs">
                <thead>
                  <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{columns.map(c => <td key={c.key}>{r[c.key] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && <p className="text-xs text-muted-foreground mt-1">...and {rows.length - 5} more</p>}
          </div>
        )}

        <Button onClick={handleImport} disabled={rows.length === 0 || importing} className="w-full">
          {importing ? "Importing..." : `Import ${rows.length} Records`}
        </Button>
      </div>
    </EntityDialog>
  );
}
