import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON || !SERVICE) return json({ error: "Server configuration unavailable" }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (roleError) return json({ error: "Unable to verify privileges" }, 500);

    const isSuperuser = (roles || []).some((role: { role?: string | null }) => role.role === "superuser");
    if (!isSuperuser) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return json({ error: "Invalid request" }, 400);

    const action = body.action;
    const targetUserId = body.target_user_id;
    const email = body.email;
    const newPassword = body.new_password;

    if (action === "delete_user") {
      if (!isUuid(targetUserId)) return json({ error: "Valid target_user_id required" }, 400);
      if (targetUserId === user.id) return json({ error: "A superuser cannot delete their own account from this action." }, 400);
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "reset_password") {
      if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) {
        return json({ error: "Valid email required" }, 400);
      }
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: email.trim() });
      if (error) throw error;
      if (!data?.properties?.action_link) throw new Error("Unable to create recovery link");
      return json({ ok: true, action_link: data.properties.action_link });
    }

    if (action === "set_password") {
      if (!isUuid(targetUserId) || typeof newPassword !== "string") {
        return json({ error: "Valid target_user_id and new_password required" }, 400);
      }
      if (newPassword.length < 12 || newPassword.length > 128) {
        return json({ error: "Password must be between 12 and 128 characters." }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (cause: unknown) {
    console.error("admin-user-action failed", cause);
    return json({ error: "The requested administrative action could not be completed." }, 500);
  }
});