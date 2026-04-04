import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";
import SortableHeader, { useSort } from "@/components/shared/SortableHeader";

const entryTypeLabels: Record<string, { label: string; color: string }> = {
  claim_submission: { label: "Claim", color: "bg-info/10 text-info border-info/20" },
  withholding_tax: { label: "WHT", color: "bg-warning/10 text-warning border-warning/20" },
  rejection: { label: "Rejection", color: "bg-destructive/10 text-destructive border-destructive/20" },
  payment: { label: "Payment", color: "bg-success/10 text-success border-success/20" },
};

export default function Ledger() {
  const { data: entries, isLoading } = useSupabaseQuery("ledger_entries");
  const { data: insurers } = useSupabaseQuery("insurance_companies");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<any>({});

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";

  let filtered = (entries || []).filter((e: any) => {
    const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.reference?.toLowerCase().includes(search.toLowerCase()) || getInsurerName(e.insurance_company_id).toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });
  if (filters.company) filtered = filtered.filter((e: any) => e.insurance_company_id === filters.company);
  if (filters.month) filtered = filtered.filter((e: any) => e.claim_month === parseInt(filters.month));
  if (filters.year) filtered = filtered.filter((e: any) => e.claim_year === parseInt(filters.year));
  if (filters.status) filtered = filtered.filter((e: any) => e.entry_type === filters.status);

  const { sorted, sort, handleSort } = useSort(filtered);

  const balances: Record<string, number> = {};
  (entries || []).forEach((e: any) => {
    balances[e.account_debit] = (balances[e.account_debit] || 0) + Number(e.amount);
    balances[e.account_credit] = (balances[e.account_credit] || 0) - Number(e.amount);
  });

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
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
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
                {sorted.map((e: any) => {
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
