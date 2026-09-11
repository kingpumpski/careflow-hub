import { useMemo, useRef, useState } from "react";
import { FileUp, FileText, Sparkles, Database, CheckCircle2, AlertTriangle, Loader2, CopyCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { usePermissions } from "@/modules/security/usePermissions";

type IntakeEntity = "insurance_company" | "claim" | "payment" | "withholding_tax";
type IntakeRecord = { entity: IntakeEntity; data: Record<string, unknown>; confidence?: number; source?: string };
type IntakeResult = { transcript: string; records: IntakeRecord[]; warnings: string[] };
type IngestSummary = { batch_id: string; received: number; inserted: number; updated: number; duplicates: number; conflicts: number; invalid: number };

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,.md,.json,.doc,.docx,application/pdf,image/*,text/*";

async function localSpreadsheetText(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return workbook.SheetNames.map((name) => `SHEET: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n").slice(0, 100_000);
}

async function localText(file: File, buffer: ArrayBuffer): Promise<string> {
  return /\.xlsx?$|\.csv$/i.test(file.name) ? localSpreadsheetText(buffer) : new TextDecoder().decode(buffer).slice(0, 100_000);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value == null || String(value).trim() === "") return undefined;
  return String(value).trim();
}

function optionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = asNumber(data[key]);
  return value == null ? undefined : value;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function DocumentIntake() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { can, loading: permissionsLoading } = usePermissions();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null);

  const mode = getCareFlowDataMode();
  const selectable = useMemo(() => result?.records ?? [], [result]);
  const canImportInsurance = can("masterdata.write");
  const canImportClaims = can("claims.write");
  const canImportPayments = can("payments.write");
  const canImportWht = can("payments.write");
  const canUseIntake = canImportInsurance || canImportClaims || canImportPayments || canImportWht;

  const canApplyRecord = (entity: IntakeEntity) => {
    if (entity === "insurance_company") return canImportInsurance;
    if (entity === "claim") return canImportClaims;
    if (entity === "payment") return canImportPayments;
    return canImportWht;
  };

  const processFile = async (nextFile: File) => {
    if (nextFile.size > MAX_FILE_BYTES) throw new Error("Files are limited to 8 MB for safe browser/edge processing.");
    const buffer = await nextFile.arrayBuffer();
    const isLocalText = /\.xlsx?$|\.csv$|\.txt$|\.md$|\.json$/i.test(nextFile.name) || nextFile.type.startsWith("text/");
    if (isLocalText) {
      const text = await localText(nextFile, buffer);
      const { data, error } = await supabase.functions.invoke("document-transcribe", { body: { file_name: nextFile.name, mime_type: nextFile.type || "text/plain", text } });
      if (error) throw error;
      return data as IntakeResult;
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const dataUrl = `data:${nextFile.type || "application/octet-stream"};base64,${btoa(binary)}`;
    const { data, error } = await supabase.functions.invoke("document-transcribe", { body: { file_name: nextFile.name, mime_type: nextFile.type || "application/octet-stream", data_url: dataUrl } });
    if (error) throw error;
    return data as IntakeResult;
  };

  const handleFile = async (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (!canUseIntake) {
      toast({ title: "Access restricted", description: "Document intake requires an authorized write permission.", variant: "destructive" });
      return;
    }
    setFile(nextFile); setResult(null); setIngestSummary(null); setSelected(new Set()); setProcessing(true);
    try {
      const parsed = await processFile(nextFile);
      setResult(parsed); setSelected(new Set(parsed.records.map((_, index) => index)));
      toast({ title: "Document transcribed", description: `${parsed.records.length} structured record${parsed.records.length === 1 ? "" : "s"} detected.` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "The file could not be processed.";
      toast({ title: "Transcription failed", description: message, variant: "destructive" });
    } finally { setProcessing(false); }
  };

  const applyRecords = async () => {
    if (!result || !file) return;
    const records = result.records.filter((_, index) => selected.has(index));
    const unauthorized = records.filter((record) => !canApplyRecord(record.entity));
    if (unauthorized.length > 0) {
      toast({ title: "Some records are not permitted", description: "Remove records outside your write permissions before applying the intake.", variant: "destructive" });
      return;
    }
    if (mode === "offline") {
      toast({ title: "Online connection required", description: "Duplicate-aware document ingestion is an online database operation. Reconnect before applying the intake.", variant: "destructive" });
      return;
    }
    setApplying(true); setIngestSummary(null);
    try {
      const normalized = records.map((record) => {
        if (record.entity === "insurance_company") return { ...record, data: { company_name: String(record.data.company_name ?? "").trim(), is_active: record.data.is_active !== false, contact_person: optionalString(record.data, "contact_person"), email: optionalString(record.data, "email"), phone: optionalString(record.data, "phone"), address: optionalString(record.data, "address") } };
        if (record.entity === "claim") return { ...record, data: { insurance_company_id: String(record.data.insurance_company_id ?? ""), claim_amount: asNumber(record.data.claim_amount), claim_month: asNumber(record.data.claim_month), claim_year: asNumber(record.data.claim_year), status: String(record.data.status ?? "submitted"), preauth_id: optionalString(record.data, "preauth_id"), patient_name: optionalString(record.data, "patient_name"), procedure_name: optionalString(record.data, "procedure_name"), submission_date: optionalString(record.data, "submission_date") } };
        if (record.entity === "payment") return { ...record, data: { insurance_company_id: String(record.data.insurance_company_id ?? ""), amount_paid: asNumber(record.data.amount_paid), payment_date: String(record.data.payment_date ?? ""), reference_number: optionalString(record.data, "reference_number"), claim_id: optionalString(record.data, "claim_id"), payment_method: optionalString(record.data, "payment_method"), claim_month: optionalNumber(record.data, "claim_month"), claim_year: optionalNumber(record.data, "claim_year") } };
        return { ...record, data: { insurance_company_id: String(record.data.insurance_company_id ?? ""), month: asNumber(record.data.month), year: asNumber(record.data.year), claim_total: optionalNumber(record.data, "claim_total"), tax_rate: optionalNumber(record.data, "tax_rate"), tax_amount: asNumber(record.data.tax_amount), is_actual: record.data.is_actual === true } };
      });

      const invalidCount = normalized.filter((record) => {
        if (record.entity === "insurance_company") return !String(record.data.company_name ?? "").trim();
        if (record.entity === "claim") return !String(record.data.insurance_company_id ?? "") || record.data.claim_amount == null || record.data.claim_month == null || record.data.claim_year == null;
        if (record.entity === "payment") return !String(record.data.insurance_company_id ?? "") || record.data.amount_paid == null || !String(record.data.payment_date ?? "");
        return !String(record.data.insurance_company_id ?? "") || record.data.month == null || record.data.year == null || record.data.tax_amount == null;
      }).length;
      if (invalidCount > 0) throw new Error(`${invalidCount} selected record${invalidCount === 1 ? " is" : "s are"} missing required fields or valid entity data.`);

      const sourceHash = await sha256(file);
      const { data, error } = await supabase.rpc("ingest_document_records", { p_source_filename: file.name, p_source_hash: sourceHash, p_records: normalized });
      if (error) throw error;
      const summary = data as IngestSummary;
      setIngestSummary(summary);
      toast({ title: "Database synchronization complete", description: `${summary.inserted} new, ${summary.updated} updated, ${summary.duplicates} exact duplicates, ${summary.conflicts} conflicts and ${summary.invalid} invalid records.` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Review the extracted fields and try again.";
      toast({ title: "Database update blocked", description: message, variant: "destructive" });
    } finally { setApplying(false); }
  };

  if (!permissionsLoading && !canUseIntake) return <div className="space-y-6"><div className="page-header"><h1 className="page-title">Document Data Intake</h1><p className="page-description">Transcribe and review structured healthcare records before committing approved data.</p></div><div className="surface-card p-6"><div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" /><div><p className="font-semibold">Access restricted</p><p className="text-sm text-muted-foreground mt-1">Your account does not have the write permission required for document intake.</p></div></div></div></div>;

  return <div className="space-y-6">
    <div className="page-header"><h1 className="page-title">Document Data Intake</h1><p className="page-description">Transcribe structured information, review it, then synchronize it safely. Existing records are matched server-side; new fields can be merged, exact repeats are flagged, and conflicting values are held for review rather than silently overwriting existing data.</p></div>
    <div className="surface-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><FileUp className="w-5 h-5" /></div><div><p className="font-semibold">Upload source document</p><p className="text-xs text-muted-foreground">PDF, image, Excel, CSV, JSON, TXT and common document formats · max 8 MB</p></div></div><Button onClick={() => inputRef.current?.click()} disabled={processing} className="gap-2"><FileUp className="w-4 h-4" />Choose file</Button></div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
      {file && <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-muted-foreground" /><span className="font-medium truncate">{file.name}</span><Badge variant="outline">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>{processing && <Loader2 className="w-4 h-4 animate-spin text-primary" />}</div>}
    </div>
    {result && <>
      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><h2 className="font-semibold">Transcription & extraction</h2></div><p className="text-xs text-muted-foreground mt-1">Nothing is written until you approve the selected records. The database operation is atomic and server-side.</p></div><Button onClick={applyRecords} disabled={applying || !selected.size} className="gap-2"><Database className="w-4 h-4" />{applying ? "Synchronizing..." : `Sync ${selected.size}`}</Button></div>
        <div className="rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap max-h-64 overflow-auto">{result.transcript || "No transcript returned."}</div>
        {result.warnings.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm space-y-1">{result.warnings.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 text-warning" />{warning}</p>)}</div>}
        {ingestSummary && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center gap-2 text-success"><CheckCircle2 className="w-4 h-4" /><span className="text-xs">New</span></div><strong className="text-xl">{ingestSummary.inserted}</strong></div>
          <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center gap-2 text-primary"><RefreshCw className="w-4 h-4" /><span className="text-xs">Updated</span></div><strong className="text-xl">{ingestSummary.updated}</strong></div>
          <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center gap-2 text-warning"><CopyCheck className="w-4 h-4" /><span className="text-xs">Duplicates</span></div><strong className="text-xl">{ingestSummary.duplicates}</strong></div>
          <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center gap-2 text-destructive"><ShieldAlert className="w-4 h-4" /><span className="text-xs">Conflicts</span></div><strong className="text-xl">{ingestSummary.conflicts}</strong></div>
          <div className="rounded-lg border bg-muted/30 p-3"><div className="flex items-center gap-2 text-muted-foreground"><AlertTriangle className="w-4 h-4" /><span className="text-xs">Invalid</span></div><strong className="text-xl">{ingestSummary.invalid}</strong></div>
          <div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Processed</div><strong className="text-xl">{ingestSummary.received}</strong></div>
        </div>}
      </div>
      <div className="surface-card overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div><Label>Structured records</Label><p className="text-xs text-muted-foreground mt-1">Select records from the source document. Existing matching records remain intact; safe missing fields are merged and conflicting values are not silently overwritten.</p></div><Badge variant="outline">{selectable.length} detected</Badge></div><div className="divide-y">{selectable.map((record, index) => <label key={`${record.entity}-${index}`} className="flex gap-3 p-4 hover:bg-muted/40 cursor-pointer"><input type="checkbox" checked={selected.has(index)} disabled={!canApplyRecord(record.entity)} onChange={(e) => setSelected((current) => { const next = new Set(current); if (e.target.checked) next.add(index); else next.delete(index); return next; })} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{record.entity}</Badge>{record.confidence != null && <span className="text-xs text-muted-foreground">{Math.round(record.confidence * 100)}% confidence</span>}{record.source && <span className="text-xs text-muted-foreground">{record.source}</span>}{!canApplyRecord(record.entity) && <Badge variant="outline">No write access</Badge>}</div><pre className="mt-2 text-xs whitespace-pre-wrap font-mono bg-muted/40 rounded p-3 overflow-auto">{JSON.stringify(record.data, null, 2)}</pre></div><CheckCircle2 className="w-4 h-4 text-success shrink-0" /></label>)}</div></div>
    </>}
  </div>;
}
