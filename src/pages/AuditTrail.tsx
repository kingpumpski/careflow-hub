import { useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import FilterBar from "@/components/shared/FilterBar";

const actionColors: Record<string, string> = {
  insert: "bg-success/10 text-success border-success/20",
  update: "bg-info/10 text-info border-info/20",
  delete: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function AuditTrail() {
  const { data: logs, isLoading } = useSupabaseQuery("audit_logs");
  const { data: profiles } = useSupabaseQuery("profiles");
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getUserName = (id: string) => (profiles || []).find((p: any) => p.id === id)?.full_name || id?.slice(0, 8) || "System";

  const filtered = (logs || []).filter((l: any) => {
    const matchSearch = !search || l.table_name?.includes(search.toLowerCase()) || l.action?.includes(search.toLowerCase()) || l.record_id?.includes(search);
    const matchTable = !filterTable || l.table_name === filterTable;
    return matchSearch && matchTable;
  });

  const tables = [...new Set((logs || []).map((l: any) => l.table_name))].sort();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" />Audit Trail</h1>
        <p className="page-description">Complete history of all system changes for accountability and compliance</p>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search audit logs..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filterTable} onChange={(e) => setFilterTable(e.target.value)}>
            <option value="">All Tables</option>
            {tables.map((t: any) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Timestamp</th><th>Table</th><th>Action</th><th>Record ID</th><th>Changed By</th><th>Details</th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((l: any) => (
                  <>
                    <tr key={l.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                      <td className="text-xs font-mono">{new Date(l.changed_at).toLocaleString()}</td>
                      <td><Badge variant="secondary" className="text-xs">{l.table_name}</Badge></td>
                      <td><Badge variant="outline" className={actionColors[l.action] || ""}>{l.action}</Badge></td>
                      <td className="text-xs font-mono text-muted-foreground">{l.record_id?.slice(0, 8)}...</td>
                      <td className="text-sm">{getUserName(l.changed_by)}</td>
                      <td className="text-xs text-muted-foreground">{l.action === "update" ? "Click to view changes" : l.action === "insert" ? "New record" : "Record deleted"}</td>
                    </tr>
                    {expandedId === l.id && (
                      <tr key={`${l.id}-detail`}>
                        <td colSpan={6} className="bg-muted/30 p-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            {l.old_data && (
                              <div>
                                <p className="font-semibold mb-1 text-destructive">Previous Values:</p>
                                <pre className="bg-background p-2 rounded overflow-auto max-h-40">{JSON.stringify(l.old_data, null, 2)}</pre>
                              </div>
                            )}
                            {l.new_data && (
                              <div>
                                <p className="font-semibold mb-1 text-success">New Values:</p>
                                <pre className="bg-background p-2 rounded overflow-auto max-h-40">{JSON.stringify(l.new_data, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No audit logs yet. Changes will appear here automatically.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
