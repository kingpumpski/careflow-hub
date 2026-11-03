import { Fragment, useMemo, useState } from "react";
import { ClipboardList, Search, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security/usePermissions";

const actionColors: Record<string, string> = {
  insert: "bg-success/10 text-success border-success/20",
  update: "bg-info/10 text-info border-info/20",
  delete: "bg-destructive/10 text-destructive border-destructive/20",
};

type AuditLog = {
  id: string;
  changed_at: string;
  table_name: string;
  action: string;
  record_id: string | null;
  changed_by: string | null;
  old_data: unknown;
  new_data: unknown;
};

export default function AuditTrail() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadAudit = can("audit.read");
  const { data: logs, isLoading } = useSupabaseQuery("audit_logs", {
    orderBy: "changed_at",
    limit: 500,
    enabled: canReadAudit && !permissionsLoading,
  });
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const typedLogs = (logs ?? []) as AuditLog[];
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return typedLogs.filter((log) => {
      const matchSearch = !normalizedSearch || [log.table_name, log.action, log.record_id ?? ""].some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchTable = !filterTable || log.table_name === filterTable;
      return matchSearch && matchTable;
    });
  }, [typedLogs, search, filterTable]);

  const tables = useMemo(() => [...new Set(typedLogs.map((log) => log.table_name))].sort(), [typedLogs]);

  if (permissionsLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!canReadAudit) {
    return (
      <div className="stat-card flex min-h-64 flex-col items-center justify-center gap-3 text-center p-6">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Audit access restricted</h1>
        <p className="max-w-md text-sm text-muted-foreground">Your account does not have the Audit Trail permission. Contact an administrator if you need access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" />Audit Trail</h1>
        <p className="page-description">Complete history of system changes for accountability and compliance</p>
      </div>

      <div className="stat-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search audit logs..." className="h-9 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select aria-label="Filter audit logs by table" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto" value={filterTable} onChange={(event) => setFilterTable(event.target.value)}>
            <option value="">All Tables</option>
            {tables.map((table) => <option key={table} value={table}>{table}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead><tr><th>Timestamp</th><th>Table</th><th>Action</th><th>Record ID</th><th>Changed By</th><th>Details</th></tr></thead>
              <tbody>
                {filtered.slice(0, 200).map((log) => (
                  <Fragment key={log.id}>
                    <tr className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="text-xs font-mono whitespace-nowrap">{new Date(log.changed_at).toLocaleString()}</td>
                      <td><Badge variant="secondary" className="text-xs">{log.table_name}</Badge></td>
                      <td><Badge variant="outline" className={actionColors[log.action] || ""}>{log.action}</Badge></td>
                      <td className="text-xs font-mono text-muted-foreground">{log.record_id ? `${log.record_id.slice(0, 8)}...` : "—"}</td>
                      <td className="text-sm font-mono">{log.changed_by ? `${log.changed_by.slice(0, 8)}...` : "System"}</td>
                      <td className="text-xs text-muted-foreground">{log.action === "update" ? "Click to view changes" : log.action === "insert" ? "New record" : "Record deleted"}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={6} className="bg-muted/30 p-4">
                          <div className="grid gap-4 text-xs md:grid-cols-2">
                            {log.old_data && <div><p className="mb-1 font-semibold text-destructive">Previous Values:</p><pre className="max-h-40 overflow-auto rounded bg-background p-2">{JSON.stringify(log.old_data, null, 2)}</pre></div>}
                            {log.new_data && <div><p className="mb-1 font-semibold text-success">New Values:</p><pre className="max-h-40 overflow-auto rounded bg-background p-2">{JSON.stringify(log.new_data, null, 2)}</pre></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No audit logs found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
