import { useMemo, useState } from "react";
import { Building2, CalendarDays, Download, FileText, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { buildLetterheadConfig } from "@/lib/letterhead";
import { isMissingLetterheadSettingsRpc } from "@/modules/reports/letterheadSettings";
import { buildCompanyStatement, formatStatementAmount, type StatementLedgerEntry } from "@/modules/statements/statementOfAccount";
import { exportCompanyStatementPDF } from "@/modules/statements/exportStatementPdf";
import { toast } from "@/hooks/use-toast";

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const money = (amount: number) => `GH¢ ${formatStatementAmount(amount)}`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function StatementsOfAccount() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canRead = can("ledger.read");
  const canManageSettings = can("settings.manage");
  const [companyId, setCompanyId] = useState("");
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(today);

  const { data: companies, isLoading: companiesLoading } = useSupabaseQuery("insurance_companies", {
    enabled: canRead && !permissionsLoading,
  });

  // Fetch every page for the selected company. The shared table hook intentionally
  // uses a single PostgREST page; a statement must never silently omit older rows.
  const { data: ledger, isLoading: ledgerLoading, error: ledgerError } = useQuery({
    queryKey: ["company-statement-ledger", companyId],
    enabled: canRead && !permissionsLoading && Boolean(companyId),
    queryFn: async () => {
      const pageSize = 1000;
      const rows: StatementLedgerEntry[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from("ledger_entries")
          .select("id, entry_date, created_at, entry_type, account_debit, account_credit, amount, insurance_company_id, reference, description")
          .eq("insurance_company_id", companyId)
          .order("entry_date", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const batch = (data || []) as unknown as StatementLedgerEntry[];
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return rows;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: settings } = useQuery({
    queryKey: ["statement-letterhead-settings", canManageSettings],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_report_letterhead_settings");
      if (!error) return data ?? [];
      if (!isMissingLetterheadSettingsRpc(error)) throw error;
      if (!canManageSettings) return [];
      const fallback = await supabase.from("system_settings").select("key, value");
      if (fallback.error) throw fallback.error;
      return fallback.data ?? [];
    },
    retry: (failureCount, error) => !isMissingLetterheadSettingsRpc(error) && failureCount < 2,
  });

  const letterhead = buildLetterheadConfig((key: string) => settings?.find?.((row: any) => row.key === key)?.value || "");
  const selectedCompany = (companies || []).find((company: any) => company.id === companyId);
  const statementResult = useMemo(() => {
    if (!companyId || !ledger) return { statement: null, error: null as string | null };
    try {
      return {
        statement: buildCompanyStatement(ledger, companyId, startDate, endDate),
        error: null as string | null,
      };
    } catch (error) {
      return {
        statement: null,
        error: error instanceof Error ? error.message : "The statement could not be calculated.",
      };
    }
  }, [ledger, companyId, startDate, endDate]);
  const statement = statementResult.statement;
  const statementError = statementResult.error;

  const generatePdf = async () => {
    if (!selectedCompany || !statement || statementError) return;
    try {
      await exportCompanyStatementPDF(selectedCompany, statement, startDate, endDate, new Date(), letterhead);
      toast({ title: "Statement generated", description: "The company statement PDF has been downloaded." });
    } catch (error) {
      toast({
        title: "Unable to generate statement",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (permissionsLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (!canRead) {
    return <div className="stat-card py-12 text-center"><h1 className="font-semibold">Statement access restricted</h1><p className="mt-1 text-sm text-muted-foreground">Ledger read permission is required to view company statements.</p></div>;
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="page-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />Statement of Account</h1>
          <p className="page-description">Generate a detailed Accounts Receivable statement for an insurance company and reporting period.</p>
        </div>
        <Button onClick={generatePdf} disabled={!statement || !!statementError || ledgerLoading || !selectedCompany}>
          <Download className="mr-2 h-4 w-4" />Generate Statement PDF
        </Button>
      </div>

      <section className="stat-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" />Statement parameters</div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="statement-company">Select company</Label>
            <select id="statement-company" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Choose an insurance company…</option>
              {(companies || []).map((company: any) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="statement-start">From date</Label><Input id="statement-start" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="statement-end">To date</Label><Input id="statement-end" type="date" value={endDate} min={startDate || undefined} max={today} onChange={(event) => setEndDate(event.target.value)} /></div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />Opening balance includes all Accounts Receivable postings before the selected start date.</p>
        {companiesLoading && <Skeleton className="h-8 w-full" />}
      </section>

      {ledgerError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Ledger records could not be loaded. Statement generation is disabled to prevent an incomplete financial document.</div>}
      {statementError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{statementError}</div>}
      {ledgerLoading && companyId && <div className="text-sm text-muted-foreground">Loading the complete company ledger history…</div>}

      {!companyId ? (
        <div className="stat-card flex min-h-48 flex-col items-center justify-center text-center">
          <FileText className="mb-3 h-9 w-9 text-muted-foreground" />
          <h2 className="font-semibold">Choose a company to begin</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select an insurance company and reporting period to preview its statement.</p>
        </div>
      ) : ledgerError ? null : ledgerLoading || !statement ? (
        <div className="stat-card"><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="stat-card"><p className="text-xs uppercase tracking-wide text-muted-foreground">Opening balance</p><p className="mt-2 text-xl font-bold tabular-nums">{money(statement.openingBalance)}</p><p className="text-xs text-muted-foreground">{statement.openingBalance < 0 ? "Credit" : statement.openingBalance > 0 ? "Debit" : "Nil"}</p></div>
            <div className="stat-card"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total debits</p><p className="mt-2 text-xl font-bold tabular-nums">{money(statement.totalDebit)}</p><p className="text-xs text-muted-foreground">Period transactions</p></div>
            <div className="stat-card"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total credits</p><p className="mt-2 text-xl font-bold tabular-nums">{money(statement.totalCredit)}</p><p className="text-xs text-muted-foreground">Period transactions</p></div>
            <div className="stat-card border-primary/30"><p className="text-xs uppercase tracking-wide text-muted-foreground">Closing balance</p><p className="mt-2 text-xl font-bold tabular-nums">{money(statement.closingBalance)}</p><p className="text-xs font-semibold">{statement.closingSide === "debit" ? "DEBIT — company owes facility" : statement.closingSide === "credit" ? "CREDIT — facility owes company" : "BALANCED — no amount outstanding"}</p></div>
          </section>

          <section className="stat-card space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedCompany?.company_name || "Company"}</h2>
                <p className="text-sm text-muted-foreground">{selectedCompany?.address || "Address not provided"}{selectedCompany?.phone ? ` · ${selectedCompany.phone}` : ""}{selectedCompany?.email ? ` · ${selectedCompany.email}` : ""}</p>
                {selectedCompany?.contact_person && <p className="text-xs text-muted-foreground">Contact: {selectedCompany.contact_person}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Period: {dateLabel(startDate)} – {dateLabel(endDate)}</p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2 text-xs"><p className="font-semibold">STATEMENT OF ACCOUNT</p><p className="text-muted-foreground">Issued {new Date().toLocaleDateString("en-GB")}</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[850px]">
                <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit (GH¢)</th><th className="text-right">Credit (GH¢)</th><th className="text-right">Balance (GH¢)</th></tr></thead>
                <tbody>
                  <tr className="bg-muted/40 font-medium"><td>{dateLabel(startDate)}</td><td>Balance brought forward</td><td>—</td><td className="text-right">{statement.openingBalance > 0 ? money(statement.openingBalance) : "—"}</td><td className="text-right">{statement.openingBalance < 0 ? money(statement.openingBalance) : "—"}</td><td className="text-right">{money(statement.openingBalance)} {statement.openingBalance < 0 ? "CR" : statement.openingBalance > 0 ? "DR" : ""}</td></tr>
                  {statement.lines.map((line) => <tr key={line.id}><td className="whitespace-nowrap">{dateLabel(line.date)}</td><td className="min-w-[220px]">{line.description}</td><td className="text-xs text-muted-foreground">{line.reference}</td><td className="text-right tabular-nums">{line.debit ? money(line.debit) : "—"}</td><td className="text-right tabular-nums">{line.credit ? money(line.credit) : "—"}</td><td className="text-right tabular-nums font-medium">{money(line.balance)} {line.balance < 0 ? "CR" : line.balance > 0 ? "DR" : ""}</td></tr>)}
                  {statement.lines.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No Accounts Receivable transactions were recorded for this company during the selected period.</td></tr>}
                </tbody>
                <tfoot><tr className="bg-muted/50 font-semibold"><td colSpan={3}>Period totals / closing balance</td><td className="text-right">{money(statement.totalDebit)}</td><td className="text-right">{money(statement.totalCredit)}</td><td className="text-right">{money(statement.closingBalance)} {statement.closingSide === "debit" ? "DR" : statement.closingSide === "credit" ? "CR" : ""}</td></tr></tfoot>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Statement basis: Accounts Receivable control-account postings only. Withholding tax is reconciled separately.</span>
              <span className="inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" />Live ledger preview</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
