import { useMemo, useState } from "react";
import { ShieldAlert, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

export default function DuplicateAudit() {
  const { data: logs, isLoading } = useSupabaseQuery("audit_logs", { filters: { action: "duplicate_rejected" } });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    const rows = (logs || []) as any[];
    if (!t) return rows;
    return rows.filter((r) => JSON.stringify(r.new_data || {}).toLowerCase().includes(t) || (r.table_name || "").toLowerCase().includes(t));
  }, [logs, search]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-warning" />Duplicate Audit</h1>
        <p className="page-description">Every duplicate row rejected during bulk imports (insurance figures, catalog, diagnosis, etc.) is captured here for review.</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search insurer, sheet, amount..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} rejection(s)</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No duplicate rejections recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table text-sm">
              <thead><tr><th>When</th><th>Source</th><th>Insurer</th><th>Period</th><th>Status</th><th>Amount</th><th>Sheet</th></tr></thead>
              <tbody>
                {filtered.map((r: any) => {
                  const d = r.new_data || {};
                  return (
                    <tr key={r.id} className="hover:bg-muted/50">
                      <td className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      <td><Badge variant="outline">{r.table_name}</Badge></td>
                      <td className="font-medium">{d.insurer || "—"}</td>
                      <td>{d.month && d.year ? `${d.month}/${d.year}` : "—"}</td>
                      <td>{d.status || "—"}</td>
                      <td>{d.amount != null ? `GH¢ ${Number(d.amount).toLocaleString()}` : "—"}</td>
                      <td className="text-xs text-muted-foreground">{d.sheet || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}