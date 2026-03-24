import { useState } from "react";
import { BookOpen, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

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
  const [filterType, setFilterType] = useState("");

  const getInsurerName = (id: string) => (insurers || []).find((i: any) => i.id === id)?.company_name || "—";

  const filtered = (entries || []).filter((e: any) => {
    const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.reference?.toLowerCase().includes(search.toLowerCase()) || getInsurerName(e.insurance_company_id).toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || e.entry_type === filterType;
    return matchSearch && matchType;
  });

  // Compute account balances
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(balances).slice(0, 4).map(([account, balance]) => (
          <div key={account} className="stat-card text-center">
            <p className="text-lg font-bold font-heading">GH¢ {Math.abs(balance).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{account} {balance >= 0 ? "(Dr)" : "(Cr)"}</p>
          </div>
        ))}
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search entries..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="claim_submission">Claims</option>
            <option value="withholding_tax">WHT</option>
            <option value="rejection">Rejections</option>
            <option value="payment">Payments</option>
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Debit</th><th>Credit</th><th>Amount</th><th>Company</th><th>Reference</th></tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => {
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
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No journal entries yet. Submit claims to generate entries.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
