import { useState, useRef, useMemo } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import EntityDialog from "./EntityDialog";
import { toast } from "@/hooks/use-toast";
import { readTabularFile, mapRows, type ImportColumn, type ParsedRow } from "@/lib/importUtils";
import DownloadTemplate from "./DownloadTemplate";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ImportColumn[];
  onImport: (rows: Record<string, any>[]) => Promise<void>;
  /** Optional file name for the in-dialog template download. */
  templateName?: string;
  description?: string;
}

export default function BulkImportDialog({ open, onOpenChange, title, columns, onImport, templateName, description }: BulkImportDialogProps) {
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const valid = useMemo(() => parsed.filter((r) => r.errors.length === 0), [parsed]);
  const invalid = useMemo(() => parsed.filter((r) => r.errors.length > 0), [parsed]);

  const reset = () => { setParsed([]); setFileName(""); setError(""); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    try {
      const raw = await readTabularFile(file);
      if (raw.length === 0) { setError("No data rows found. Keep the header row on the Data sheet and add at least one record."); return; }
      const rows = mapRows(raw, columns);
      if (rows.length === 0) { setError("Could not match any columns. Download the template and keep its header row."); return; }
      setParsed(rows);
      setFileName(file.name);
    } catch (err: any) {
      setError("Failed to read file: " + err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(valid.map((r) => r.values));
      toast({ title: "Import successful", description: `${valid.length} records imported${invalid.length ? `, ${invalid.length} skipped` : ""}` });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <EntityDialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }} title={title}>
      <div className="space-y-4">
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div>
          <div className="flex items-center justify-between">
            <Label>Upload Excel or CSV file</Label>
            <DownloadTemplate columns={columns} fileName={templateName || "import-template"} />
          </div>
          <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">.xlsx, .xls or .csv — headers must match the template</p>
            <p className="text-xs text-muted-foreground mb-2">
              Excel template: complete the <strong>Data</strong> sheet only. The <strong>Guide</strong> sheet contains field definitions and is ignored automatically during import; you do not need to delete it.
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Columns: {columns.map((c) => c.label + (c.required ? "*" : "")).join(", ")}
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />Choose File
            </Button>
            {fileName && <p className="text-xs text-muted-foreground mt-2">{fileName}</p>}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {parsed.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-success"><CheckCircle2 className="w-4 h-4" />{valid.length} ready</span>
              {invalid.length > 0 && <span className="flex items-center gap-1 text-destructive"><XCircle className="w-4 h-4" />{invalid.length} with problems</span>}
            </div>

            {valid.length > 0 && (
              <div className="max-h-40 overflow-auto border rounded-lg">
                <table className="data-table text-xs">
                  <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {valid.slice(0, 5).map((r) => (
                      <tr key={r.index}>{columns.map((c) => <td key={c.key}>{r.values[c.key] !== undefined && r.values[c.key] !== "" ? String(r.values[c.key]) : "—"}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {valid.length > 5 && <p className="text-xs text-muted-foreground">...and {valid.length - 5} more</p>}

            {invalid.length > 0 && (
              <div className="max-h-32 overflow-auto rounded-lg bg-destructive/5 p-3 space-y-1">
                {invalid.slice(0, 10).map((r) => (
                  <p key={r.index} className="text-xs text-destructive">Row {r.index}: {r.errors.join("; ")}</p>
                ))}
                {invalid.length > 10 && <p className="text-xs text-muted-foreground">...and {invalid.length - 10} more rows with problems</p>}
              </div>
            )}
          </div>
        )}

        <Button onClick={handleImport} disabled={valid.length === 0 || importing} className="w-full">
          {importing ? "Importing..." : `Import ${valid.length} Record${valid.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </EntityDialog>
  );
}
