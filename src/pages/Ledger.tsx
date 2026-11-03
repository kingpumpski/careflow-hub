import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";
import { usePermissions } from "@/modules/security/usePermissions";

const entryTypeLabels: Record<string, { label: string; color: string }> = {
  claim_submission: { label: "Claim", color: "bg-info/10 text-info border-info/20" },
  withholding_tax: { label: "WHT", color: "bg-warning/10 text-warning border-warning/20" },
  rejection: { label: "Rejection", color: "bg-destructive/10 text-destructive border-destructive/20" },
  payment: { label: "Payment", color: "bg-success/10 text-success border-success/20" },
};

type LedgerEntry = {
  id: string;
  entry_date: string;
  entry_type: string;
  account_debit: string;
  account_credit: string;
  amount: number;
  insurance_company_id?: string | null;
  reference?: string | null;
  description?: string | null;
  claim_month?: number | null;
  claim_year?: number | null;
};

type Insurer = { id: string; company_name: string };
type LedgerFilters = { company?: string; month?: string; year?: string; status?: string };

export default function Ledger() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadLedger = can("ledger.read");
  const { data: entries, isLoading } = useSupabaseQuery("ledger_entries", { enabled: canReadLedger && !permissionsLoading });
  const { data: insurers } = useSupabaseQuery("insurance_companies", { enabled: canReadLedger && !permissionsLoading });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LedgerFilters>({});

  const insurerRows = (insurers || []) as unknown as Insurer[];
  const ledgerEntries = (entries || []) as unknown as LedgerEntry[];
  const getInsurerName = (id: string | null | undefined) => insurerRows.find((i) => i.id === id)?.company_name || "—";

  let filtered = ledgerEntries.filter((e) => {
    const query = search.toLowerCase();
    const matchSearch = !query || e.description?.toLowerCase().includes(query) || e.reference?.toLowerCase().includes(query) || getInsurerName(e.insurance_company_id).toLowerCase().includes(query);
    return matchSearch;
  });
  if (filters.company) filtered = filtered.filter((e) => e.insurance_company_id === filters.company);
  if (filters.month) filtered = filtered.filter((e) => e.claim_month === parseInt(filters.month, 10));
  if (filters.year) filtered = filtered.filter((e) => e.claim_year === parseInt(filters.year, 10));
  if (filters.status) filtered = filtered.filter((e) => e.entry_type === filters.status);

  // Keep every hook unconditional so permission loading/restricted renders never change hook order.
  const { sorted, sort, handleSort } = useSort(filtered);

  const balances: Record<string, number> = {};
  ledgerEntries.forEach((e) => {
    balances[e.account_debit] = (balances[e.account_debit] || 0) + Number(e.amount);
    balances[e.account_credit] = (balances[e.account_credit] || 0) - Number(e.amount);
  });

  if (permissionsLoading) {
    return <div className="stat-card py-12 text-center text-muted-foreground">Checking ledger access…</div>;
  }

  if (!canReadLedger) {
    return <div className="stat-card py-12 text-center"><BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h1 className="font-semibold">Ledger access restricted</h1><p className="mt-1 text-sm text-muted-foreground">You do not have permission to view accounting ledger entries.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BookOpen className="w-6 h-6 text-primary" />General Ledger</h1>
        <p className="page-description">Double-entry accounting journal — all transactions automatically recorded</p>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        showCompany
        showStatus
        statusOptions={[
          { value: "claim_submission", label: "Claims" },
          { value: "withholding_tax", label: "WHT" },
          { value: "rejection", label: "Rejections" },
          { value: "payment", label: "Payments" },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(balances).slice(0, 4).map(([account, balance]) => (
          <div key={account} className="stat-card text-center">
            <p className="text-lg font-bold font-heading">GH¢ {Math.abs(balance).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{account} {balance >= 0 ? "(Dr)" : "(Cr)"}</p>
          </div>
        ))}
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search entries..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader label="Date" sortKey="entry_date" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Type" sortKey="entry_type" currentSort={sort} onSort={handleSort} />
                  <th>Debit</th><th>Credit</th>
                  <SortableHeader label="Amount" sortKey="amount" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Company" sortKey="insurance_company_id" currentSort={sort} onSort={handleSort} />
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const typeInfo = entryTypeLabels[e.entry_type] || { label: e.entry_type, color: "" };
                  return (
                    <tr key={e.id} className="hover:bg-muted/50 transition-colors">
                      <td className="font-medium text-xs">{e.entry_date}</td>
                      <td><Badge variant="outline" className={typeInfo.color}>{typeInfo.label}</Badge></td>
                      <td className="text-sm">{e.account_debit}</td>
                      <td className="text-sm">{e.account_credit}</td>
                      <td className="font-semibold">GH¢ {Number(e.amount).toLocaleString()}</td>
                      <td className="text-sm">{getInsurerName(e.insurance_company_id)}</td>
                      <td className="text-xs text-muted-foreground">{e.reference || "—"}</td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No journal entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}