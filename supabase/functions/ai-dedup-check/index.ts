import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedEntities = new Set(["diagnosis", "procedure", "template", "catalog", "insurance"]);
const MAX_EXISTING = 80;
const MAX_BODY_BYTES = 256_000;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authorization?.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("AUTH_REQUIRED");
  return user;
}

function safeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (origin && !allowedOrigins.includes(origin)) return json(req, { error: "Origin not allowed" }, 403);

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json(req, { error: "Request payload too large" }, 413);

    await requireUser(req);

    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    const entity = typeof payload?.entity === "string" ? payload.entity : "";
    const candidate = safeObject(payload?.candidate);
    const existing = Array.isArray(payload?.existing) ? payload.existing : null;

    if (!allowedEntities.has(entity) || !candidate || !existing) {
      return json(req, { error: "Invalid duplicate-check payload" }, 400);
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json(req, { duplicate: false, confidence: 0, reason: "AI service unavailable" }, 503);

    const trimmed = existing.slice(0, MAX_EXISTING).map((entry) => {
      const object = safeObject(entry) || {};
      const { id, code, item_name, procedure_name, template_name, company_name, description, name } = object;
      return { id, code, item_name, procedure_name, template_name, company_name, description, name };
    });

    const prompt = `You are a healthcare data steward. Decide if the CANDIDATE is a duplicate of any item in EXISTING for entity type "${entity}".
Treat near-identical names, abbreviations, and code matches as duplicates. Reply ONLY as JSON.

CANDIDATE: ${JSON.stringify(candidate)}
EXISTING: ${JSON.stringify(trimmed)}

Return: {"duplicate": boolean, "confidence": 0-1, "match_id": "<id-if-duplicate-or-null>", "reason": "short explanation"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("ai-dedup-check gateway failure", res.status);
      return json(req, { duplicate: false, confidence: 0, reason: "AI service unavailable" }, 502);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    let parsed: Record<string, unknown> = {};
    if (typeof text === "string") {
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { parsed = {}; }
    }

    const duplicate = parsed.duplicate === true;
    const confidenceValue = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0;
    const matchId = typeof parsed.match_id === "string" ? parsed.match_id : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : "No reliable AI explanation returned";

    return json(req, { duplicate, confidence, match_id: duplicate ? matchId : null, reason });
  } catch (cause: unknown) {
    if (cause instanceof Error && cause.message === "AUTH_REQUIRED") return json(req, { error: "Authentication required" }, 401);
    console.error("ai-dedup-check failed", cause);
    return json(req, { duplicate: false, confidence: 0, reason: "Unable to complete duplicate check" }, 500);
  }
});