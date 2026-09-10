import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const READ_PERMISSIONS = ["claims.read", "payments.read", "preauth.read", "reports.read", "analytics.read", "ledger.read"];

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https?:\/\/localhost:\d+$/.test(origin) || /^https:\/\/[-a-z0-9]+\.app\.github\.dev$/.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = isAllowedOrigin(origin) ? origin : null;
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(req: Request, body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

function validateMessages(value: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) throw new Error("INVALID_MESSAGE_PAYLOAD");
  let totalLength = 0;
  const messages = value.map((message) => {
    if (!message || typeof message !== "object") throw new Error("INVALID_MESSAGE_PAYLOAD");
    const candidate = message as Record<string, unknown>;
    if (candidate.role !== "user" && candidate.role !== "assistant") throw new Error("INVALID_MESSAGE_ROLE");
    if (typeof candidate.content !== "string" || candidate.content.length === 0 || candidate.content.length > 8000) {
      throw new Error("INVALID_MESSAGE_CONTENT");
    }
    totalLength += candidate.content.length;
    if (totalLength > 50000) throw new Error("MESSAGE_PAYLOAD_TOO_LARGE");
    return { role: candidate.role, content: candidate.content } as { role: "user" | "assistant"; content: string };
  });
  return messages;
}

async function getAuthorizedClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !supabaseAnonKey || !authorization?.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");

  // Use the caller's JWT/RLS context. The service-role key is intentionally never used here.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("AUTH_REQUIRED");

  // Prevent users with no operational read permission from consuming the AI gateway.
  const permissionResults = await Promise.all(READ_PERMISSIONS.map((permission) =>
    supabase.rpc("current_user_has_permission", { p_permission_key: permission }),
  ));
  if (!permissionResults.some(({ data, error }) => !error && data === true)) throw new Error("FORBIDDEN");

  return supabase;
}

async function getSystemContext(supabase: ReturnType<typeof createClient>) {
  // AI context is limited to operational/aggregate fields; patient/clinical/document payloads are excluded.
  const [claimsRes, paymentsRes, preauthRes, insurersRes, taxRes, ledgerRes] = await Promise.all([
    supabase.from("claims").select("insurance_company_id, claim_amount, status, claim_year, claim_month").order("claim_year", { ascending: false }).order("claim_month", { ascending: false }).limit(200),
    supabase.from("payments").select("insurance_company_id, amount_paid, payment_date").order("payment_date", { ascending: false }).limit(200),
    supabase.from("pre_authorizations").select("id").limit(50),
    supabase.from("insurance_companies").select("id, company_name"),
    supabase.from("withholding_tax").select("insurance_company_id, tax_amount").limit(100),
    supabase.from("ledger_entries").select("id").order("created_at", { ascending: false }).limit(50),
  ]);
  const firstError = [claimsRes.error, paymentsRes.error, preauthRes.error, insurersRes.error, taxRes.error, ledgerRes.error].find(Boolean);
  if (firstError) throw new Error("SYSTEM_DATA_UNAVAILABLE");

  const claims = claimsRes.data ?? [], payments = paymentsRes.data ?? [], preauths = preauthRes.data ?? [];
  const insurers = insurersRes.data ?? [], tax = taxRes.data ?? [], ledger = ledgerRes.data ?? [];
  const submittedClaims = claims.filter((c) => c.status !== "rejected");
  const rejectedClaims = claims.filter((c) => c.status === "rejected");
  const totalSubmitted = submittedClaims.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
  const totalRejected = rejectedClaims.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
  const netClaim = totalSubmitted - totalRejected;
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalTax = tax.reduce((s, t) => s + Number(t.tax_amount || 0), 0);
  const outstanding = netClaim - totalPaid - totalTax;

  const companyBreakdown = insurers.map((ins) => {
    const insClaims = submittedClaims.filter((c) => c.insurance_company_id === ins.id);
    const insRejected = rejectedClaims.filter((c) => c.insurance_company_id === ins.id);
    const insPayments = payments.filter((p) => p.insurance_company_id === ins.id);
    const insTax = tax.filter((t) => t.insurance_company_id === ins.id);
    const sub = insClaims.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const rej = insRejected.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const net = sub - rej;
    const paid = insPayments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    const wht = insTax.reduce((s, t) => s + Number(t.tax_amount || 0), 0);
    return `- ${ins.company_name}: Submitted GH¢${sub.toLocaleString()} | Rejected GH¢${rej.toLocaleString()} | Net GH¢${net.toLocaleString()} | Paid GH¢${paid.toLocaleString()} | WHT GH¢${wht.toLocaleString()} | Outstanding GH¢${(net - paid - wht).toLocaleString()}`;
  }).filter((line) => !line.includes("Submitted GH¢0"));

  const riskAlerts: string[] = [];
  insurers.forEach((ins) => {
    const claimTotal = submittedClaims.filter((c) => c.insurance_company_id === ins.id).reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const paidTotal = payments.filter((p) => p.insurance_company_id === ins.id).reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    if (claimTotal > 0 && paidTotal / claimTotal < 0.3) riskAlerts.push(`⚠️ ${ins.company_name}: Only ${((paidTotal / claimTotal) * 100).toFixed(1)}% paid — potential default risk`);
  });

  const monthlyTrend: Record<string, { submitted: number; paid: number; rejected: number }> = {};
  claims.forEach((c) => {
    const key = `${c.claim_year}-${String(c.claim_month).padStart(2, "0")}`;
    if (!monthlyTrend[key]) monthlyTrend[key] = { submitted: 0, paid: 0, rejected: 0 };
    if (c.status === "rejected") monthlyTrend[key].rejected += Number(c.claim_amount || 0);
    else monthlyTrend[key].submitted += Number(c.claim_amount || 0);
  });
  payments.forEach((p) => {
    const d = new Date(p.payment_date);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyTrend[key]) monthlyTrend[key].paid += Number(p.amount_paid || 0);
  });

  return `
## LIVE SYSTEM DATA (authenticated user's permitted scope)
### Financial Summary
- Total Submitted Claims: GH¢ ${totalSubmitted.toLocaleString()}
- Total Rejected: GH¢ ${totalRejected.toLocaleString()}
- Net Claims (Submitted - Rejected): GH¢ ${netClaim.toLocaleString()}
- Total Payments Received: GH¢ ${totalPaid.toLocaleString()}
- Total WHT Deducted: GH¢ ${totalTax.toLocaleString()}
- Outstanding (Net Claim - Paid - WHT): GH¢ ${outstanding.toLocaleString()}
- Pre-Authorizations: ${preauths.length}
- Insurance Companies: ${insurers.length}
- Journal Entries: ${ledger.length}
### Company-by-Company Breakdown
${companyBreakdown.join("\n") || "No claims data yet"}
### Monthly Trend
${Object.entries(monthlyTrend).sort().slice(-6).map(([k, v]) => `- ${k}: Submitted GH¢${v.submitted.toLocaleString()} | Paid GH¢${v.paid.toLocaleString()} | Rejected GH¢${v.rejected.toLocaleString()}`).join("\n") || "No trend data"}
${riskAlerts.length ? `### ⚠️ Risk Alerts\n${riskAlerts.join("\n")}` : "### No risk alerts"}
### System Navigation
- Dashboard: /dashboard
- Claims: /claims
- Payments: /payments
- Withholding Tax: /withholding-tax
- Outstanding: /outstanding
- Rejections: /rejections
- Pre-Authorization: /pre-auth
- Reports: /reports
- General Ledger: /ledger
- Audit Trail: /audit-trail
- Insurance Companies: /insurance
- Settings: /settings
`;
}

serve(async (req) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (!isAllowedOrigin(origin)) return jsonResponse(req, { error: "Origin not allowed" }, 403);
    if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return jsonResponse(req, { error: "Authentication required" }, 401);

    const payload = await req.json();
    const messages = validateMessages(payload?.messages);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse(req, { error: "AI service unavailable" }, 503);

    const supabase = await getAuthorizedClient(req);
    const systemContext = await getSystemContext(supabase);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are the MedClaims AI Assistant — an expert in medical insurance claims management, accounting, and financial analysis for healthcare facilities.
Use only the authenticated user's permitted live system data below. Never infer or request patient identifiers, clinical notes, medical histories, diagnoses, document contents, credentials, secrets or other sensitive payloads. Treat risk alerts as indicators for human review, not proof of fraud or default.
${systemContext}
Core formulas: Net Claim = Submitted Claims - Rejections; Outstanding = Net Claim - Payments - Withholding Tax; Withholding Tax = Tax Rate × Net Claim Amount.
Keep answers clear, professional and data-driven. Use GH¢ as currency. Do not expose internal tokens, database details, service keys or implementation secrets.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse(req, { error: "Rate limit exceeded. Please try again in a moment." }, 429);
      if (response.status === 402) return jsonResponse(req, { error: "AI usage limit reached. Please add credits." }, 402);
      console.error("AI gateway error:", response.status);
      return jsonResponse(req, { error: "AI service temporarily unavailable." }, 502);
    }

    return new Response(response.body, { headers: { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return jsonResponse(req, { error: "Authentication required" }, 401);
    if (error instanceof Error && error.message === "FORBIDDEN") return jsonResponse(req, { error: "Insufficient permission" }, 403);
    if (error instanceof Error && ["INVALID_MESSAGE_PAYLOAD", "INVALID_MESSAGE_ROLE", "INVALID_MESSAGE_CONTENT", "MESSAGE_PAYLOAD_TOO_LARGE"].includes(error.message)) return jsonResponse(req, { error: "Invalid AI message payload" }, 400);
    console.error("chat error:", error);
    return jsonResponse(req, { error: "Unable to process AI request" }, 500);
  }
});
