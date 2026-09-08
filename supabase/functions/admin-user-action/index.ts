import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const VALID_ROLES = new Set(["superuser", "admin", "claims_officer", "accounts_officer", "data_entry_officer", "auditor", "viewer"]);
const MAX_PERMISSION_KEYS = 100;
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
const cleanText = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";

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

    if (action === "list_users") {
      const users: Array<Record<string, unknown>> = [];
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const batch = data.users ?? [];
        users.push(...batch.map((u) => ({ id: u.id, email: u.email ?? null, full_name: cleanText(u.user_metadata?.full_name, 160) || null, email_confirmed_at: u.email_confirmed_at ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null })));
        if (batch.length < 1000) break;
      }
      const [{ data: profiles, error: profilesError }, { data: roleRows, error: roleRowsError }, { data: overrides, error: overridesError }, { data: catalog, error: catalogError }] = await Promise.all([
        admin.from("profiles").select("id, full_name, email"),
        admin.from("user_roles").select("id, user_id, role"),
        admin.from("user_permission_overrides").select("user_id, permission_key, granted"),
        admin.from("app_permissions").select("key, label, category, description").order("category").order("label"),
      ]);
      if (profilesError || roleRowsError || overridesError || catalogError) throw profilesError || roleRowsError || overridesError || catalogError;
      return json(req, { users, profiles: profiles ?? [], roles: roleRows ?? [], overrides: overrides ?? [], permissions: catalog ?? [] });
    }

    if (action === "create_user") {
      const email = cleanText(body.email, 254).toLowerCase();
      const fullName = cleanText(body.full_name, 160);
      const password = body.password;
      const role = cleanText(body.role, 40);
      if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || typeof password !== "string" || !VALID_ROLES.has(role)) return json(req, { error: "Valid name, email, password and role are required." }, 400);
      if (password.length < 12 || password.length > 128) return json(req, { error: "Password must be between 12 and 128 characters." }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error || !data.user) throw error ?? new Error("User creation failed");
      const userId = data.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({ id: userId, full_name: fullName, email }, { onConflict: "id" });
      if (profileError) throw profileError;
      const { data: existingRole, error: roleLookupError } = await admin.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
      if (roleLookupError) throw roleLookupError;
      if (existingRole?.id) {
        const { error } = await admin.from("user_roles").update({ role }).eq("id", existingRole.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
        if (error) throw error;
      }
      return json(req, { ok: true, user: { id: userId, email, full_name: fullName, role } });
    }

    if (action === "update_access") {
      if (!isUuid(targetUserId)) return json(req, { error: "Valid target_user_id required" }, 400);
      if (targetUserId === user.id && body.role && body.role !== "superuser") return json(req, { error: "You cannot remove your own superuser role." }, 400);
      const role = cleanText(body.role, 40);
      if (!VALID_ROLES.has(role)) return json(req, { error: "Invalid role" }, 400);
      const rawOverrides = body.overrides;
      if (!Array.isArray(rawOverrides) || rawOverrides.length > MAX_PERMISSION_KEYS) return json(req, { error: "Invalid permission overrides" }, 400);
      const overrides = rawOverrides.filter((item): item is { permission_key: string; granted: boolean } => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).permission_key === "string" && typeof (item as Record<string, unknown>).granted === "boolean").map((item) => ({ user_id: targetUserId, permission_key: item.permission_key.trim(), granted: item.granted }));
      if (overrides.some((item) => !item.permission_key || item.permission_key.length > 100)) return json(req, { error: "Invalid permission key" }, 400);
      const { data: validPermissions, error: permissionError } = await admin.from("app_permissions").select("key");
      if (permissionError) throw permissionError;
      const validKeys = new Set((validPermissions ?? []).map((p: { key: string }) => p.key));
      if (overrides.some((item) => !validKeys.has(item.permission_key))) return json(req, { error: "Unknown permission" }, 400);
      const { data: targetRole, error: targetRoleError } = await admin.from("user_roles").select("id").eq("user_id", targetUserId).maybeSingle();
      if (targetRoleError) throw targetRoleError;
      if (targetRole?.id) {
        const { error } = await admin.from("user_roles").update({ role }).eq("id", targetRole.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("user_roles").insert({ user_id: targetUserId, role });
        if (error) throw error;
      }
      const { error: deleteError } = await admin.from("user_permission_overrides").delete().eq("user_id", targetUserId);
      if (deleteError) throw deleteError;
      if (overrides.length) {
        const { error: overrideError } = await admin.from("user_permission_overrides").insert(overrides);
        if (overrideError) throw overrideError;
      }
      return json(req, { ok: true });
    }

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
      if (targetUserId === user.id) return json(req, { error: "Use the normal account password flow for your own account." }, 400);
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
