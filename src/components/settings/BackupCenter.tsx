import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Database, Download, Loader2, RefreshCw, RotateCcw, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { BACKUP_INTERVALS, BACKUP_RETENTION_OPTIONS, formatBytes } from "@/lib/backupSchedule";

type BackupSettings = Database["public"]["Tables"]["backup_settings"]["Row"];
type BackupRun = Database["public"]["Tables"]["backup_runs"]["Row"];

function totalTableRecords(value: Json): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).reduce((total, count) => total + (typeof count === "number" && Number.isFinite(count) ? count : 0), 0);
}

export default function BackupCenter() {
  const { userRole } = useAuth() as { userRole?: string | null };
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("backup_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("backup_runs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setSettings(s ?? null);
    setRuns(r ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveSettings = async (patch: Partial<BackupSettings>) => {
    const { error } = await db.from("backup_settings").update(patch).eq("id", 1);
    if (error) return toast({ title: "Could not save schedule", description: error.message, variant: "destructive" });
    toast({ title: "Backup schedule saved" });
    void load();
  };

  const call = async (action: string, backup_id?: string) => {
    const { data, error } = await supabase.functions.invoke("system-backup", { body: { action, backup_id } });
    if (error || !data?.ok) {
      let msg = data?.error ?? error?.message ?? "Request failed";
      if (error instanceof FunctionsHttpError) {
        try {
          const payload = await error.context.json() as { error?: string };
          msg = payload.error ?? msg;
        } catch { /* keep msg */ }
      }
      throw new Error(msg);
    }
    return data;
  };

  const backupNow = async () => {
    setBusy("create");
    try {
      await call("create");
      toast({ title: "Backup created", description: "The backup file was saved and verified." });
    } catch (e) {
      toast({ title: "Backup failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); void load(); }
  };

  const download = async (id: string) => {
    setBusy(id);
    try {
      const data = await call("download", id);
      const a = document.createElement("a");
      a.href = data.url; a.download = data.file_name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const restore = async (id: string) => {
    setBusy(id);
    try {
      const data = await call("restore", id);
      const failed = Object.values(data.results as Record<string, { failed: number }>).reduce((n, r) => n + r.failed, 0);
      toast({ title: "Restore finished", description: failed ? `${failed} record(s) could not be restored.` : "All records were restored." });
    } catch (e) {
      toast({ title: "Restore failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); void load(); }
  };

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");

  return (
    <div className="stat-card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-primary" />System Backups</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Compressed backup files with a SHA-256 fingerprint for each section, checked after saving. They cover all records, settings, roles and the audit trail.
          </p>
        </div>
        <span className="text-xs rounded-full border px-2 py-1 text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Admin only · private</span>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <p className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Automatic schedule</p>
        {loading && !settings ? <p className="text-sm text-muted-foreground">Loading…</p> : !settings ? (
          <p className="text-sm text-muted-foreground">Only admins can view backup settings.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="flex items-center gap-3">
                <Switch id="backup-enabled" checked={settings.enabled} onCheckedChange={(v) => void saveSettings({ enabled: v })} />
                <Label htmlFor="backup-enabled">{settings.enabled ? "Automatic backups on" : "Automatic backups off"}</Label>
              </div>
              <div>
                <Label>How often</Label>
                <Select value={String(settings.interval_hours)} onValueChange={(v) => void saveSettings({ interval_hours: Number(v) })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{BACKUP_INTERVALS.map((o) => <SelectItem key={o.hours} value={String(o.hours)}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Files to keep</Label>
                <Select value={String(settings.retention_count)} onValueChange={(v) => void saveSettings({ retention_count: Number(v) })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{BACKUP_RETENTION_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>Latest {n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-muted-foreground">Last backup</p><p className="font-medium">{fmt(settings.last_run_at)}</p></div>
              <div><p className="text-muted-foreground">Next automatic backup</p><p className="font-medium">{settings.enabled ? `${fmt(settings.next_run_at)} (checked on the hour)` : "Paused"}</p></div>
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={backupNow} disabled={busy !== null}>
            {busy === "create" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}Back Up Now
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium text-sm">Backup history</h4>
        {runs.length === 0 ? <p className="text-sm text-muted-foreground">No backups yet.</p> : runs.map((run) => {
          const total = totalTableRecords(run.table_counts);
          return (
            <div key={run.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{fmt(run.created_at)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{run.trigger_type} · {run.file_bytes ? formatBytes(run.file_bytes) : "—"} · {total.toLocaleString()} records</p>
                </div>
                <span className={`text-xs rounded-full border px-2 py-1 ${run.status === "completed" ? "border-primary/40 text-primary" : run.status === "failed" ? "border-destructive/40 text-destructive" : "text-muted-foreground"}`}>
                  {run.status === "completed" ? "Verified" : run.status === "failed" ? "Failed" : "Running"}
                </span>
              </div>
              {run.sha256 && <p className="text-[11px] text-muted-foreground break-all">SHA-256: {run.sha256}</p>}
              {run.error_message && <p className="text-xs text-muted-foreground">{run.error_message}</p>}
              {run.status === "completed" && run.file_path && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void download(run.id)}>
                    {busy === run.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Download
                  </Button>
                  {userRole === "superuser" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={busy !== null}><RotateCcw className="w-4 h-4 mr-2" />Restore</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Every record in this backup will be put back as it was on {fmt(run.created_at)}. Records changed since then will be overwritten; records added since then are kept. The file is checked before anything changes, and the restore is recorded in the audit trail.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void restore(run.id)}>Restore</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Backup files don't include passwords, uploaded logos or secret keys. Users keep their own sign-in, and logos can be uploaded again. The files contain confidential data, so store downloads somewhere safe.
      </p>
    </div>
  );
}
