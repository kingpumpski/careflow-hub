// Scheduled + on-demand system backups.
// Format: gzip-compressed JSON ("medclaims-backup" v1.0) containing a manifest with
// per-table SHA-256 checksums and row counts, plus every application table's rows.
// Files are stored in the private "system-backups" bucket; only admins can read them.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const FORMAT = "medclaims-backup";
const FORMAT_VERSION = "1.0";
const BUCKET = "system-backups";

// Ordered so parent records come before the records that point to them (restore order).
export const BACKUP_TABLES = [
  "system_settings",
  "insurance_companies",
  "client_companies",
  "doctors",
  "procedures",
  "diagnosis_codes",
  "preauth_catalog_items",
  "patients",
  "procedure_templates",
  "pre_authorizations",
  "preauth_items",
  "preauth_versions",
  "preauth_email_log",
  "claims",
  "payments",
  "withholding_tax",
  "ledger_entries",
  "profiles",
  "user_roles",
  "notifications",
  "chat_messages",
  "audit_logs",
] as const;

// Browser access is limited to the deployed GitHub Pages origin. Scheduled
// requests are server-to-server and do not require a browser CORS allowance.
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kingpumpski.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (data: Uint8Array | string) =>
  hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? new TextEncoder().encode(data) : data));

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

async function readAll(admin: SupabaseClient, table: string) {
  const rows: unknown[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin.from(table).select("*").order("id", { ascending: true }).range(from, from + size - 1);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return rows;
}

async function audit(admin: SupabaseClient, action: string, recordId: string | null, actor: string | null, data: Record<string, unknown>) {
  await admin.from("audit_logs").insert({ table_name: "backup_runs", record_id: recordId, action, new_data: data, changed_by: actor });
}

async function runBackup(admin: SupabaseClient, trigger: "scheduled" | "manual", actor: string | null) {
  const { data: run, error: runError } = await admin.from("backup_runs")
    .insert({ trigger_type: trigger, requested_by: actor, format_version: FORMAT_VERSION }).select("id, created_at").single();
  if (runError || !run) throw new Error(runError?.message ?? "Could not start backup");
  try {
    const tables: Record<string, unknown[]> = {};
    const checksums: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const rows = await readAll(admin, t);
      tables[t] = rows;
      counts[t] = rows.length;
      checksums[t] = await sha256(JSON.stringify(rows));
    }
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = (list?.users ?? []).map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.user_metadata }));
    const manifest = {
      format: FORMAT,
      format_version: FORMAT_VERSION,
      backup_id: run.id,
      created_at: run.created_at,
      trigger,
      encoding: "application/json; charset=utf-8",
      compression: "gzip (RFC 1952)",
      checksum_algorithm: "SHA-256",
      restore_order: BACKUP_TABLES,
      table_counts: counts,
      table_checksums: checksums,
      user_accounts: users.length,
      excludes: ["passwords", "uploaded files (logos)", "secrets and API keys"],
    };
    const payload = JSON.stringify({ manifest, tables, user_accounts: users });
    const bytes = await gzip(payload);
    const fileHash = await sha256(bytes);
    const stamp = new Date(run.created_at).toISOString().replace(/[:.]/g, "-");
    const path = `${stamp.slice(0, 7)}/medclaims-backup-${stamp}-${run.id.slice(0, 8)}.json.gz`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/gzip", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    // Verify the stored copy matches what we produced.
    const { data: stored, error: dlErr } = await admin.storage.from(BUCKET).download(path);
    if (dlErr || !stored) throw new Error("Stored backup could not be re-read for verification");
    if (await sha256(new Uint8Array(await stored.arrayBuffer())) !== fileHash) throw new Error("Stored backup failed checksum verification");

    await admin.from("backup_runs").update({
      status: "completed", completed_at: new Date().toISOString(), file_path: path, file_bytes: bytes.byteLength, sha256: fileHash, table_counts: counts,
    }).eq("id", run.id);
    await audit(admin, "BACKUP_CREATED", run.id, actor, { trigger, file_bytes: bytes.byteLength, sha256: fileHash });
    await applyRetention(admin);
    return { id: run.id, file_path: path, sha256: fileHash, file_bytes: bytes.byteLength };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("backup_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message.slice(0, 1000) }).eq("id", run.id);
    await audit(admin, "BACKUP_FAILED", run.id, actor, { trigger, error: message.slice(0, 300) });
    throw e;
  }
}

async function applyRetention(admin: SupabaseClient) {
  const { data: s } = await admin.from("backup_settings").select("retention_count").eq("id", 1).single();
  const keep = s?.retention_count ?? 14;
  const { data: old } = await admin.from("backup_runs").select("id, file_path").eq("status", "completed").not("file_path", "is", null)
    .order("created_at", { ascending: false }).range(keep, keep + 500);
  if (!old?.length) return;
  await admin.storage.from(BUCKET).remove(old.map((r) => r.file_path as string));
  await admin.from("backup_runs").update({ file_path: null, error_message: "File removed by retention policy" }).in("id", old.map((r) => r.id));
}

async function restore(admin: SupabaseClient, runId: string, actor: string) {
  const { data: run } = await admin.from("backup_runs").select("file_path, sha256").eq("id", runId).eq("status", "completed").single();
  if (!run?.file_path) throw new Error("That backup file is not available");
  const { data: file, error } = await admin.storage.from(BUCKET).download(run.file_path);
  if (error || !file) throw new Error("Backup file could not be read");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (await sha256(bytes) !== run.sha256) throw new Error("Backup file failed checksum verification; restore cancelled");
  const parsed = JSON.parse(await gunzip(bytes));
  if (parsed?.manifest?.format !== FORMAT) throw new Error("Not a MedClaims backup file");
  for (const t of parsed.manifest.restore_order as string[]) {
    if (await sha256(JSON.stringify(parsed.tables[t] ?? [])) !== parsed.manifest.table_checksums[t]) throw new Error(`Section ${t} failed checksum verification`);
  }
  const results: Record<string, { restored: number; failed: number }> = {};
  for (const t of parsed.manifest.restore_order as string[]) {
    if (!(BACKUP_TABLES as readonly string[]).includes(t)) continue;
    const rows = parsed.tables[t] as Record<string, unknown>[];
    const r = { restored: 0, failed: 0 };
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: upErr } = await admin.from(t).upsert(chunk, { onConflict: "id" });
      if (!upErr) { r.restored += chunk.length; continue; }
      for (const row of chunk) { // fall back row by row so one bad record doesn't block the rest
        const { error: rowErr } = await admin.from(t).upsert(row, { onConflict: "id" });
        if (rowErr) r.failed++; else r.restored++;
      }
    }
    results[t] = r;
  }
  await audit(admin, "BACKUP_RESTORED", runId, actor, { results });
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { action?: string; backup_id?: string };

  try {
    // Scheduled path: called by the managed scheduler every hour; runs only when a backup is due.
    if (body.action === "scheduled_tick") {
      const denied = authenticateCronRequest(req);
      if (denied) return denied;
      const { data: s } = await admin.from("backup_settings").select("*").eq("id", 1).single();
      if (!s?.enabled) return json({ ok: true, skipped: "disabled" });
      if (s.next_run_at && new Date(s.next_run_at).getTime() > Date.now()) return json({ ok: true, skipped: "not_due" });
      const now = new Date();
      await admin.from("backup_settings").update({ last_run_at: now.toISOString(), next_run_at: new Date(now.getTime() + s.interval_hours * 3600_000).toISOString() }).eq("id", 1);
      const result = await runBackup(admin, "scheduled", null);
      return json({ ok: true, result });
    }

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const { data: { user } } = await admin.auth.getUser(auth.slice(7));
    if (!user) return json({ error: "Sign in required" }, 401);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("superuser") && !roleSet.has("admin")) return json({ error: "Only admins can manage backups" }, 403);

    if (body.action === "create") {
      const since = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data: running } = await admin.from("backup_runs").select("id").eq("status", "running").gte("created_at", since).limit(1);
      if (running?.length) return json({ error: "A backup is already running. Please wait a moment." }, 429);
      const result = await runBackup(admin, "manual", user.id);
      await admin.from("backup_settings").update({ last_run_at: new Date().toISOString() }).eq("id", 1);
      return json({ ok: true, result });
    }
    if (body.action === "download") {
      if (!body.backup_id) return json({ error: "backup_id required" }, 400);
      const { data: run } = await admin.from("backup_runs").select("file_path").eq("id", body.backup_id).single();
      if (!run?.file_path) return json({ error: "Backup file not available" }, 404);
      const name = run.file_path.split("/").pop()!;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(run.file_path, 120, { download: name });
      if (error || !data) throw error ?? new Error("Could not create link");
      await audit(admin, "BACKUP_DOWNLOADED", body.backup_id, user.id, {});
      return json({ ok: true, url: data.signedUrl, file_name: name });
    }
    if (body.action === "restore") {
      if (!roleSet.has("superuser")) return json({ error: "Only a superuser can restore a backup" }, 403);
      if (!body.backup_id) return json({ error: "backup_id required" }, 400);
      const results = await restore(admin, body.backup_id, user.id);
      return json({ ok: true, results });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("system-backup failed", e);
    return json({ error: e instanceof Error ? e.message : "Backup action failed" }, 500);
  }
});
