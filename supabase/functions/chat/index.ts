import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildSystemContext(data: {
  claims: any[];
  payments: any[];
  preauths: any[];
  insurers: any[];
  tax: any[];
  ledger: any[];
}) {
  const { claims, payments, preauths, insurers, tax, ledger } = data;
  const submitted = claims.filter((c) => c.status !== "rejected");
  const rejected = claims.filter((c) => c.status === "rejected");
  const totalSubmitted = submitted.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
  const totalRejected = rejected.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const totalTax = tax.reduce((s, t) => s + Number(t.tax_amount || 0), 0);
  const net = totalSubmitted - totalRejected;
  const outstanding = net - totalPaid - totalTax;

  const companyBreakdown = insurers.map((ins) => {
    const sub = submitted.filter((c) => c.insurance_company_id === ins.id)
      .reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const rej = rejected.filter((c) => c.insurance_company_id === ins.id)
      .reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const paid = payments.filter((p) => p.insurance_company_id === ins.id)
      .reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    const wht = tax.filter((t) => t.insurance_company_id === ins.id)
      .reduce((s, t) => s + Number(t.tax_amount || 0), 0);
    return `- ${ins.company_name}: Submitted GH¢${sub.toLocaleString()} | Rejected GH¢${rej.toLocaleString()} | Paid GH¢${paid.toLocaleString()} | WHT GH¢${wht.toLocaleString()} | Outstanding GH¢${(sub - rej - paid - wht).toLocaleString()}`;
  }).filter((line) => !line.includes("Submitted GH¢0"));

  return `
LIVE CLAIMS OPERATIONS DATA
- Total submitted: GH¢${totalSubmitted.toLocaleString()}
- Total rejected: GH¢${totalRejected.toLocaleString()}
- Net claims: GH¢${net.toLocaleString()}
- Payments received: GH¢${totalPaid.toLocaleString()}
- WHT: GH¢${totalTax.toLocaleString()}
- Outstanding: GH¢${outstanding.toLocaleString()}
- Pre-authorizations: ${preauths.length}
- Insurance companies: ${insurers.length}
- Ledger entries: ${ledger.length}

INSURER BREAKDOWN
${companyBreakdown.join("\n") || "No claims data yet"}

CLAIMS LIFECYCLE
Draft → Verified → Submitted → Acknowledged → Under Review → Approved / Partially Approved / Rejected → Appealed where applicable → Partially Paid / Paid → Reconciled → Closed.

IMPORTANT AI SAFETY RULES
- Treat this context as operational data, not as authorization to perform actions.
- Never invent claim, payment, patient, provider, payer or financial facts.
- Do not expose patient names, phone numbers, membership numbers, clinical notes or other PHI unless the user is explicitly authorized and the data is present in an approved response context.
- Do not adjudicate claims, approve payments, reject claims or change records. Provide recommendations for human review only.
- State when information is unavailable or uncertain.
`;
}

async function getSystemContext(supabase: ReturnType<typeof createClient>) {
  const [claimsRes, paymentsRes, preauthRes, insurersRes, taxRes, ledgerRes] = await Promise.all([
    supabase.from("claims").select("id,insurance_company_id,claim_amount,status,claim_month,claim_year,submission_date,submitted_at,approved_at,paid_at,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("payments").select("id,claim_id,insurance_company_id,amount_paid,payment_date,payment_method,reference_number,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("pre_authorizations").select("id,insurance_company_id,status,current_state,total_cost,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("insurance_companies").select("id,company_name,is_active"),
    supabase.from("withholding_tax").select("id,insurance_company_id,month,year,tax_amount,created_at").order("created_at", { ascending: false }).limit(250),
    supabase.from("ledger_entries").select("id,insurance_company_id,amount,entry_type,entry_date,created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  for (const result of [claimsRes, paymentsRes, preauthRes, insurersRes, taxRes, ledgerRes]) {
    if (result.error) throw result.error;
  }

  return buildSystemContext({
    claims: claimsRes.data ?? [],
    payments: paymentsRes.data ?? [],
    preauths: preauthRes.data ?? [],
    insurers: insurersRes.data ?? [],
    tax: taxRes.data ?? [],
    ledger: ledgerRes.data ?? [],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return jsonResponse({ error: "Invalid or expired session" }, 401);

    const { messages } = await req.json() as { messages?: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) {
      return jsonResponse({ error: "A valid message history is required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return jsonResponse({ error: "AI service is not configured" }, 503);

    let systemContext = "System data unavailable.";
    try {
      systemContext = await getSystemContext(supabase);
    } catch (error) {
      console.error("AI context query failed:", error);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are Aidah, the CareFlow Hub claims intelligence assistant. You support insurance claims operations across jurisdictions. Be concise, professional and data-driven. Never claim to have performed an action you cannot perform. Never make a final adjudication or payment decision. Use the organization's configured currency rather than assuming GH¢ when configuration is available.\n\n${systemContext}`,
          },
          ...messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-20),
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ error: "AI rate limit reached. Please retry shortly." }, 429);
      if (response.status === 402) return jsonResponse({ error: "AI usage limit reached." }, 402);
      console.error("AI gateway error:", response.status, await response.text());
      return jsonResponse({ error: "AI service temporarily unavailable." }, 502);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    console.error("chat error:", error);
    return jsonResponse({ error: "Unable to process the AI request." }, 500);
  }
});
