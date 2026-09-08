import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const isAllowedOrigin = (origin: string | null) => !origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost:\d+$/.test(origin) || /^https:\/\/[-a-z0-9]+\.app\.github\.dev$/.test(origin);
const corsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin");
  return {
    ...(isAllowedOrigin(origin) && origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
};
const json = (req: Request, body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    if (!isAllowedOrigin(req.headers.get("Origin"))) return json(req, { error: "Origin not allowed" }, 403);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON || !SERVICE) return json(req, { error: "Server configuration unavailable" }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (roleError) return json(req, { error: "Unable to verify privileges" }, 500);
    if (!(roles || []).some((role: { role?: string | null }) => role.role === "superuser")) return json(req, { error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return json(req, { error: "Invalid request" }, 400);
    const action = body.action;
    const targetUserId = body.target_user_id;

    if (action === "delete_user") {
      if (!isUuid(targetUserId)) return json(req, { error: "Valid target_user_id required" }, 400);
      if (targetUserId === user.id) return json(req, { error: "A superuser cannot delete their own account from this action." }, 400);
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "reset_password") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(req, { error: "Valid email required" }, 400);

      const publicAuth = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
      const redirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT_URL")?.trim();
      const { error } = await publicAuth.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "set_password") {
      const newPassword = body.new_password;
      if (!isUuid(targetUserId) || typeof newPassword !== "string") return json(req, { error: "Valid target_user_id and new_password required" }, 400);
      if (newPassword.length < 12 || newPassword.length > 128) return json(req, { error: "Password must be between 12 and 128 characters." }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
      if (error) throw error;
      return json(req, { ok: true });
    }
    return json(req, { error: "Unknown action" }, 400);
  } catch (cause: unknown) {
    console.error("admin-user-action failed", cause);
    return json(req, { error: "The requested administrative action could not be completed." }, 500);
  }
});
