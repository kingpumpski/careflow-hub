import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { aiDuplicateCheck } from "@/lib/dedupCheck";

type ParsedRow = {
  sheet: string;
  year: number;
  month: number;
  insurerNameRaw: string;
  submitted: number;
  rejected: number;
  paid: number;
  wht: number;
};

type MissingMap = Record<string, {
  action: "map" | "create" | "skip";
  insurerId?: string;
  newName?: string;
  aiConfidence?: number;
  aiReason?: string;
}>;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function norm(s: any) { return String(s ?? "").trim().toLowerCase(); }
function num(v: any) { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; }
function detectMonth(v: any): number | null {
  if (v == null) return null;
  const s = norm(v);
  if (!s) return null;
  if (MONTHS[s]) return MONTHS[s];
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 12) return n;
  for (const k of Object.keys(MONTHS)) if (s.startsWith(k)) return MONTHS[k];
  return null;
}

function parseSheet(sheetName: string, rows: any[][], fallbackYear: number): ParsedRow[] {
  if (!rows.length) return [];
  const year = (() => {
    const m = sheetName.match(/(20\d{2}|19\d{2})/);
    return m ? parseInt(m[1], 10) : fallbackYear;
  })();
  // Find header row (first row with an insurer-like column)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(norm);
    if (r.some((c) => c.includes("insur") || c.includes("company"))) { headerIdx = i; break; }
  }
  const header = rows[headerIdx].map(norm);
  const insurerCol = header.findIndex((c) => c.includes("insur") || c.includes("company") || c === "name");
  if (insurerCol < 0) return [];

  // Two supported layouts:
  //  A) Long: columns include "month", "submitted", "rejected", "paid", "wht"
  //  B) Wide: one row per insurer, columns are month names (each cell = submitted amount)
  const monthCol = header.findIndex((c) => c === "month" || c === "period");
  const submittedCol = header.findIndex((c) => c.includes("submit"));
  const rejectedCol = header.findIndex((c) => c.includes("reject"));
  const paidCol = header.findIndex((c) => c.includes("paid"));
  const whtCol = header.findIndex((c) => c.includes("wht") || c.includes("tax"));

  const out: ParsedRow[] = [];
  if (monthCol >= 0 && submittedCol >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r.length) continue;
      const insurer = String(r[insurerCol] ?? "").trim();
      const m = detectMonth(r[monthCol]);
      if (!insurer || !m) continue;
      out.push({
        sheet: sheetName, year, month: m, insurerNameRaw: insurer,
        submitted: num(r[submittedCol]),
        rejected: rejectedCol >= 0 ? num(r[rejectedCol]) : 0,
        paid: paidCol >= 0 ? num(r[paidCol]) : 0,
        wht: whtCol >= 0 ? num(r[whtCol]) : 0,
      });
    }
  } else {
    // Wide layout: locate month columns
    const monthCols: { col: number; month: number }[] = [];
    header.forEach((c, idx) => { const m = detectMonth(c); if (m) monthCols.push({ col: idx, month: m }); });
    if (!monthCols.length) return [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r.length) continue;
      const insurer = String(r[insurerCol] ?? "").trim();
      if (!insurer) continue;
      for (const mc of monthCols) {
        const v = num(r[mc.col]);
        if (!v) continue;
        out.push({ sheet: sheetName, year, month: mc.month, insurerNameRaw: insurer, submitted: v, rejected: 0, paid: 0, wht: 0 });
      }
    }
  }
  return out;
}

export default function InsuranceBulkImport() {
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const { data: existingClaims } = useSupabaseQuery("claims");
  const { data: existingPayments } = useSupabaseQuery("payments");
  const { data: existingWHT } = useSupabaseQuery("withholding_tax");
  const insertClaim = useSupabaseInsert("claims");
  const insertPayment = useSupabaseInsert("payments");
  const insertWHT = useSupabaseInsert("withholding_tax");
  const insertAudit = useSupabaseInsert("audit_logs");
  const insertInsurer = useSupabaseInsert("insurance_companies");
  const updateClaim = useSupabaseUpdate("claims");
  const updatePayment = useSupabaseUpdate("payments");
  const updateWHT = useSupabaseUpdate("withholding_tax");

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [missingMap, setMissingMap] = useState<MissingMap>({});
  const [importing, setImporting] = useState(false);
  const [aiMatching, setAiMatching] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{ inserted: number; updated: number; duplicates: number; created: number } | null>(null);

  const insurerIndex = useMemo(() => {
    const m = new Map<string, any>();
    (insurers || []).forEach((i: any) => { m.set(norm(i.company_name), i); });
    return m;
  }, [insurers]);

  const distinctNames = useMemo(() => Array.from(new Set(rows.map((r) => r.insurerNameRaw))), [rows]);
  const missing = useMemo(() => distinctNames.filter((n) => !insurerIndex.get(norm(n))), [distinctNames, insurerIndex]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(""); setSummary(null); setRows([]); setMissingMap({});
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const fallbackYear = new Date().getFullYear();
      const parsed: ParsedRow[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: null });
        parsed.push(...parseSheet(name, aoa as any[][], fallbackYear));
      }
      if (!parsed.length) { setError("Could not detect an insurer column or any month/amount data in this workbook."); return; }
      setRows(parsed);
      // Prime missing map with default action=map
      const init: MissingMap = {};
      Array.from(new Set(parsed.map((p) => p.insurerNameRaw))).forEach((n) => {
        if (!insurerIndex.get(norm(n))) init[n] = { action: "map" };
      });
      setMissingMap(init);
    } catch (err: any) { setError("Failed to parse file: " + err.message); }
  };

  const resolveInsurerId = async (nameRaw: string): Promise<string | null> => {
    const existing = insurerIndex.get(norm(nameRaw));
    if (existing) return existing.id;
    const decision = missingMap[nameRaw];
    if (!decision || decision.action === "skip") return null;
    if (decision.action === "map" && decision.insurerId) return decision.insurerId;
    if (decision.action === "create") {
      const newName = (decision.newName || nameRaw).trim();
      const created = await insertInsurer.mutateAsync({ company_name: newName, is_active: true, color: "#3b82f6" });
      insurerIndex.set(norm(newName), created);
      return (created as any).id;
    }
    return null;
  };

  const dupKey = (companyId: string, month: number, year: number, status: string, amount: number) =>
    `${companyId}|${month}|${year}|${status}|${amount}`;

  /** AI-assisted routing: ask the dedup model to match each unmatched file name to an existing insurer. */
  const runAiMatch = async () => {
    if (!missing.length) return;
    setAiMatching(true);
    try {
      const corpus = (insurers || []).map((i: any) => ({ id: i.id, company_name: i.company_name }));
      let matched = 0;
      for (const name of missing) {
        const res = await aiDuplicateCheck("insurance", { company_name: name }, corpus);
        if (res.duplicate && res.match_id && corpus.some((c) => c.id === res.match_id)) {
          matched++;
          setMissingMap((m) => ({
            ...m,
            [name]: { action: "map", insurerId: res.match_id!, aiConfidence: res.confidence, aiReason: res.reason },
          }));
        } else {
          setMissingMap((m) => ({
            ...m,
            [name]: { action: "create", newName: name, aiConfidence: res.confidence, aiReason: res.reason || "No close match — suggest creating" },
          }));
        }
      }
      toast({ title: "AI routing complete", description: `${matched} of ${missing.length} names matched to existing insurers` });
    } catch (e: any) {
      toast({ title: "AI routing failed", description: e?.message, variant: "destructive" });
    } finally { setAiMatching(false); }
  };

  const runImport = async () => {
    // Verify each missing name has a decision
    for (const n of missing) {
      const d = missingMap[n];
      if (!d) { setError(`Choose an action for "${n}"`); return; }
      if (d.action === "map" && !d.insurerId) { setError(`Pick a target insurer for "${n}"`); return; }
      if (d.action === "create" && !(d.newName || n).trim()) { setError(`Give a name for the new insurer for "${n}"`); return; }
    }
    setError(""); setImporting(true);
    let inserted = 0, updated = 0, duplicates = 0, created = 0;
    try {
      const createdBefore = insurerIndex.size;

      // Index existing rows by (insurer|month|year|status) so we can upsert instead of blind-inserting.
      const claimIdx = new Map<string, { id: string; amount: number }>();
      (existingClaims || []).forEach((c: any) =>
        claimIdx.set(`${c.insurance_company_id}|${c.claim_month}|${c.claim_year}|${c.status}`, { id: c.id, amount: Number(c.claim_amount || 0) }));
      const payIdx = new Map<string, { id: string; amount: number }>();
      (existingPayments || []).forEach((p: any) =>
        payIdx.set(`${p.insurance_company_id}|${p.claim_month}|${p.claim_year}`, { id: p.id, amount: Number(p.amount_paid || 0) }));
      const whtIdx = new Map<string, { id: string; amount: number }>();
      (existingWHT || []).forEach((w: any) =>
        whtIdx.set(`${w.insurance_company_id}|${w.month}|${w.year}`, { id: w.id, amount: Number(w.tax_amount || 0) }));

      const logDuplicate = async (r: ParsedRow, kind: string, amount: number) => {
        duplicates++;
        await insertAudit.mutateAsync({
          table_name: "insurance_bulk_import", record_id: `${r.insurerNameRaw}|${r.month}|${r.year}|${kind}|${amount}`,
          action: "duplicate_rejected",
          new_data: { insurer: r.insurerNameRaw, sheet: r.sheet, month: r.month, year: r.year, status: kind, amount },
        });
      };

      for (const r of rows) {
        const insurerId = await resolveInsurerId(r.insurerNameRaw);
        if (!insurerId) continue; // skipped by user decision

        // Claims (submitted / rejected) — upsert on (insurer, month, year, status)
        for (const status of ["submitted", "rejected"] as const) {
          const amount = status === "submitted" ? r.submitted : r.rejected;
          if (amount <= 0) continue;
          const key = `${insurerId}|${r.month}|${r.year}|${status}`;
          const hit = claimIdx.get(key);
          if (hit && hit.amount === amount) { await logDuplicate(r, status, amount); continue; }
          if (hit) {
            await updateClaim.mutateAsync({ id: hit.id, claim_amount: amount });
            await insertAudit.mutateAsync({
              table_name: "claims", record_id: hit.id, action: "bulk_import_update",
              old_data: { claim_amount: hit.amount }, new_data: { claim_amount: amount, sheet: r.sheet },
            });
            claimIdx.set(key, { id: hit.id, amount }); updated++;
          } else {
            const row: any = await insertClaim.mutateAsync({ insurance_company_id: insurerId, claim_amount: amount, claim_month: r.month, claim_year: r.year, status });
            claimIdx.set(key, { id: row?.id, amount }); inserted++;
          }
        }

        // Payment — upsert on (insurer, month, year)
        if (r.paid > 0) {
          const key = `${insurerId}|${r.month}|${r.year}`;
          const hit = payIdx.get(key);
          if (hit && hit.amount === r.paid) { await logDuplicate(r, "paid", r.paid); }
          else if (hit) {
            await updatePayment.mutateAsync({ id: hit.id, amount_paid: r.paid });
            await insertAudit.mutateAsync({ table_name: "payments", record_id: hit.id, action: "bulk_import_update", old_data: { amount_paid: hit.amount }, new_data: { amount_paid: r.paid, sheet: r.sheet } });
            payIdx.set(key, { id: hit.id, amount: r.paid }); updated++;
          } else {
            const row: any = await insertPayment.mutateAsync({
              insurance_company_id: insurerId, amount_paid: r.paid, claim_month: r.month, claim_year: r.year,
              payment_date: new Date(r.year, r.month - 1, 1).toISOString().slice(0, 10), payment_method: "bulk_import",
            });
            payIdx.set(key, { id: row?.id, amount: r.paid }); inserted++;
          }
        }

        // WHT — upsert on (insurer, month, year)
        if (r.wht > 0) {
          const key = `${insurerId}|${r.month}|${r.year}`;
          const hit = whtIdx.get(key);
          const payload = { claim_total: r.submitted, tax_rate: r.submitted ? (r.wht / r.submitted) * 100 : 0, tax_amount: r.wht };
          if (hit && hit.amount === r.wht) { await logDuplicate(r, "wht", r.wht); }
          else if (hit) {
            await updateWHT.mutateAsync({ id: hit.id, ...payload });
            await insertAudit.mutateAsync({ table_name: "withholding_tax", record_id: hit.id, action: "bulk_import_update", old_data: { tax_amount: hit.amount }, new_data: { ...payload, sheet: r.sheet } });
            whtIdx.set(key, { id: hit.id, amount: r.wht }); updated++;
          } else {
            const row: any = await insertWHT.mutateAsync({ insurance_company_id: insurerId, month: r.month, year: r.year, ...payload });
            whtIdx.set(key, { id: row?.id, amount: r.wht }); inserted++;
          }
        }
      }
      created = insurerIndex.size - createdBefore;
      setSummary({ inserted, updated, duplicates, created });
      toast({ title: "Import complete", description: `${inserted} inserted · ${updated} updated · ${duplicates} duplicates rejected · ${created} insurers created` });
    } catch (err: any) {
      setError(err.message || "Import failed");
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally { setImporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><FileSpreadsheet className="w-6 h-6 text-primary" />Insurance Bulk Import</h1>
        <p className="page-description">Upload a multi-sheet Excel file (one sheet per year). Rows are routed to the right insurer, duplicates are rejected, and every rejection is logged to the Duplicate Audit.</p>
      </div>

      <div className="stat-card space-y-4">
        <div>
          <Label>Upload Workbook</Label>
          <div className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">One sheet per year. Include an <em>Insurance</em>/<em>Company</em> column plus month rows or month columns.</p>
            <p className="text-xs text-muted-foreground mt-1">Recognised value columns: Submitted, Rejected, Paid, WHT.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Choose Excel File</Button>
          </div>
        </div>

        {error && <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-sm text-destructive"><AlertCircle className="w-4 h-4 mt-0.5" />{error}</div>}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="stat-card"><p className="text-2xl font-bold">{rows.length}</p><p className="text-xs text-muted-foreground">Rows parsed</p></div>
              <div className="stat-card"><p className="text-2xl font-bold">{distinctNames.length}</p><p className="text-xs text-muted-foreground">Insurers detected</p></div>
              <div className="stat-card"><p className="text-2xl font-bold text-warning">{missing.length}</p><p className="text-xs text-muted-foreground">Unmatched insurers</p></div>
              <div className="stat-card"><p className="text-2xl font-bold">{new Set(rows.map(r => r.year)).size}</p><p className="text-xs text-muted-foreground">Years covered</p></div>
            </div>

            {missing.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-heading font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-warning" />Resolve missing insurers</h3>
                  <Button variant="outline" size="sm" onClick={runAiMatch} disabled={aiMatching} className="gap-2">
                    <Sparkles className="w-4 h-4" />{aiMatching ? "AI matching..." : "AI match insurers"}
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="data-table text-sm">
                    <thead><tr><th>Name in file</th><th>Action</th><th>Target / New name</th><th>AI suggestion</th></tr></thead>
                    <tbody>
                      {missing.map((name) => {
                        const d = missingMap[name] || { action: "map" };
                        return (
                          <tr key={name}>
                            <td className="font-medium">{name}</td>
                            <td>
                              <select className="h-8 rounded border border-input bg-background px-2 text-xs" value={d.action}
                                onChange={(e) => setMissingMap((m) => ({ ...m, [name]: { ...d, action: e.target.value as any } }))}>
                                <option value="map">Map to existing</option>
                                <option value="create">Create new insurer</option>
                                <option value="skip">Skip rows</option>
                              </select>
                            </td>
                            <td>
                              {d.action === "map" && (
                                <select className="h-8 rounded border border-input bg-background px-2 text-xs w-full" value={d.insurerId || ""}
                                  onChange={(e) => setMissingMap((m) => ({ ...m, [name]: { ...d, insurerId: e.target.value } }))}>
                                  <option value="">— Choose insurer —</option>
                                  {(insurers || []).map((i: any) => <option key={i.id} value={i.id}>{i.company_name}</option>)}
                                </select>
                              )}
                              {d.action === "create" && (
                                <input className="h-8 rounded border border-input bg-background px-2 text-xs w-full" placeholder={name}
                                  value={d.newName ?? name}
                                  onChange={(e) => setMissingMap((m) => ({ ...m, [name]: { ...d, newName: e.target.value } }))} />
                              )}
                              {d.action === "skip" && <span className="text-xs text-muted-foreground">Rows will be dropped</span>}
                            </td>
                            <td className="text-xs text-muted-foreground max-w-[220px]">
                              {d.aiReason ? (
                                <span>
                                  {typeof d.aiConfidence === "number" && (
                                    <Badge variant="outline" className="mr-1">{Math.round(d.aiConfidence * 100)}%</Badge>
                                  )}
                                  {d.aiReason}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h3 className="font-heading font-semibold mb-2">Preview (first 10 rows)</h3>
              <div className="border rounded-lg overflow-x-auto">
                <table className="data-table text-xs">
                  <thead><tr><th>Sheet</th><th>Year</th><th>Month</th><th>Insurer</th><th>Submitted</th><th>Rejected</th><th>Paid</th><th>WHT</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => {
                      const matched = insurerIndex.get(norm(r.insurerNameRaw));
                      return (
                        <tr key={i}>
                          <td>{r.sheet}</td><td>{r.year}</td><td>{r.month}</td>
                          <td>{r.insurerNameRaw}</td>
                          <td>{r.submitted.toLocaleString()}</td>
                          <td>{r.rejected.toLocaleString()}</td>
                          <td>{r.paid.toLocaleString()}</td>
                          <td>{r.wht.toLocaleString()}</td>
                          <td>{matched ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Matched</Badge> : <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Needs action</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && <p className="text-xs text-muted-foreground mt-1">…and {rows.length - 10} more rows</p>}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Duplicate rule: exact match on (insurer, month, year, status, amount) is rejected and logged.</p>
              <Button onClick={runImport} disabled={importing} className="gap-2">
                {importing ? "Importing..." : <>Import <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </div>
          </>
        )}

        {summary && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/20 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <div className="text-sm">
              <div className="font-medium">Import complete</div>
              <div className="text-muted-foreground">Inserted <b>{summary.inserted}</b> · Duplicates rejected <b>{summary.duplicates}</b> · New insurers <b>{summary.created}</b></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}