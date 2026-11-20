import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "npm:@aws-sdk/client-s3@3.800.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.800.0";

const projectRef = "jajfdgknctzqypdtvmxo";
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const isAllowedOrigin = (origin: string | null) => !origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost:\d+$/.test(origin) || /^https:\/\/[-a-z0-9]+\.app\.github\.dev$/.test(origin);
const corsHeaders = (req: Request) => ({
  ...(isAllowedOrigin(req.headers.get("Origin")) && req.headers.get("Origin") ? { "Access-Control-Allow-Origin": req.headers.get("Origin")!, Vary: "Origin" } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});
const json = (req: Request, body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    if (!isAllowedOrigin(req.headers.get("Origin"))) return json(req, { error: "Origin not allowed" }, 403);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const r2Account = Deno.env.get("BACKUP_R2_ACCOUNT_ID");
    const r2Key = Deno.env.get("BACKUP_R2_READ_ACCESS_KEY_ID");
    const r2Secret = Deno.env.get("BACKUP_R2_READ_SECRET_ACCESS_KEY");
    const r2Bucket = Deno.env.get("BACKUP_R2_BUCKET");
    if (!supabaseUrl || !anonKey || !serviceKey || !r2Account || !r2Key || !r2Secret || !r2Bucket) return json(req, { error: "Backup service is not configured." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (roleError) return json(req, { error: "Unable to verify backup privileges." }, 500);
    const role = (roles ?? []).find((entry: { role?: string }) => entry.role === "superuser" || entry.role === "admin")?.role;
    if (!role) return json(req, { error: "Only an authorized system administrator can manage system backups." }, 403);

    const body = await req.json().catch(() => null) as { action?: string; backup_id?: string } | null;
    if (!body || !["list", "create", "download"].includes(body.action ?? "")) return json(req, { error: "Invalid backup action." }, 400);
    const audit = async (action: string, metadata: Record<string, unknown> = {}) => {
      const { error } = await admin.from("security_audit_log").insert({ actor_user_id: user.id, action, target_user_id: null, metadata: { project_ref: projectRef, ...metadata } });
      if (error) throw error;
    };

    if (body.action === "create") {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentRequests, error: rateLimitError } = await admin
        .from("security_audit_log")
        .select("created_at")
        .eq("actor_user_id", user.id)
        .eq("action", "system_backup_requested")
        .gte("created_at", since)
        .limit(1);
      if (rateLimitError) return json(req, { error: "Unable to verify backup request rate limit." }, 500);
      if (recentRequests?.length) return json(req, { error: "A full-system backup was already requested in the last 10 minutes. Check the backup list before retrying." }, 429);

      const token = Deno.env.get("GITHUB_BACKUP_DISPATCH_TOKEN");
      const repository = Deno.env.get("GITHUB_BACKUP_REPOSITORY") ?? "kingpumpski/careflow-hub";
      if (!token) return json(req, { error: "Backup scheduler is not configured." }, 503);
      const dispatch = await fetch("https://api.github.com/repos/" + repository + "/actions/workflows/system-backup.yml/dispatches", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { reason: "Requested by an authenticated CareFlow administrator" } }),
      });
      if (dispatch.status !== 204) {
        const detail = (await dispatch.text()).slice(0, 500);
        console.error("Backup workflow dispatch failed:", dispatch.status, detail);
        return json(req, { error: "Unable to start the backup workflow. Check backup service configuration." }, 502);
      }
      await audit("system_backup_requested", { role });
      return json(req, { ok: true, message: "Backup job queued. Refresh the backup list after the workflow completes." }, 202);
    }

    const client = new S3Client({
      region: "auto",
      endpoint: "https://" + r2Account + ".r2.cloudflarestorage.com",
      credentials: { accessKeyId: r2Key, secretAccessKey: r2Secret },
    });

    if (body.action === "list") {
      const manifests = [];
      let continuationToken: string | undefined;
      let scanned = 0;
      do {
        const listed = await client.send(new ListObjectsV2Command({
          Bucket: r2Bucket,
          Prefix: "manifests/" + projectRef + "/",
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }));
        for (const item of (listed.Contents ?? []).filter((entry) => entry.Key?.endsWith(".json"))) {
          const response = await client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: item.Key! }));
          const raw = await response.Body?.transformToString();
          if (!raw) continue;
          const manifest = JSON.parse(raw);
          if (manifest.project_ref !== projectRef || manifest.verification !== "sha256-verified") continue;
          manifests.push({
            backup_id: manifest.backup_id,
            created_at: manifest.created_at,
            encrypted_bytes: manifest.encrypted_bytes,
            encrypted_sha256: manifest.encrypted_sha256,
            database_bytes: manifest.database_bytes,
            storage_bucket_count: manifest.storage_bucket_count,
            storage_object_count: manifest.storage_object_count,
            verification: manifest.verification,
            source_commit: manifest.source_commit,
          });
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        scanned += listed.Contents?.length ?? 0;
      } while (continuationToken && scanned < 5000);
      manifests.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      await audit("system_backup_listed", { count: manifests.length });
      return json(req, { backups: manifests });
    }

    const backupId = body.backup_id;
    if (typeof backupId !== "string" || !/^[0-9T-]{8,30}-[0-9a-f-]{8,40}$/.test(backupId)) return json(req, { error: "Invalid backup ID." }, 400);
    const manifestKey = "manifests/" + projectRef + "/" + backupId + ".json";
    const response = await client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: manifestKey }));
    const raw = await response.Body?.transformToString();
    if (!raw) return json(req, { error: "Backup manifest is unavailable." }, 404);
    const manifest = JSON.parse(raw);
    if (manifest.project_ref !== projectRef || manifest.backup_id !== backupId || manifest.verification !== "sha256-verified" || typeof manifest.encrypted_object_key !== "string" || !manifest.encrypted_object_key.startsWith("backups/" + projectRef + "/")) {
      return json(req, { error: "Backup manifest failed validation." }, 409);
    }
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: r2Bucket,
      Key: manifest.encrypted_object_key,
      ResponseContentDisposition: "attachment; filename=careflow-system-backup-" + backupId + ".tar.gz.age",
    }), { expiresIn: 60 });
    await audit("system_backup_downloaded", { backup_id: backupId });
    return json(req, { download_url: url, expires_in_seconds: 60, encrypted_sha256: manifest.encrypted_sha256, backup_id: backupId });
  } catch (error) {
    console.error("backup-control failed:", error);
    return json(req, { error: "The backup request could not be completed." }, 500);
  }
});
