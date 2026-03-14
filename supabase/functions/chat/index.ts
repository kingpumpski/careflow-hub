import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getSystemContext() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [claimsRes, paymentsRes, preauthRes, insurersRes, taxRes] = await Promise.all([
    supabase.from("claims").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("pre_authorizations").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("insurance_companies").select("*"),
    supabase.from("withholding_tax").select("*").limit(50),
  ]);

  const claims = claimsRes.data || [];
  const payments = paymentsRes.data || [];
  const preauths = preauthRes.data || [];
  const insurers = insurersRes.data || [];
  const tax = taxRes.data || [];

  const totalClaimsAmount = claims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
  const totalTax = tax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
  const outstanding = totalClaimsAmount - totalPaid - totalTax;

  const statusCounts: Record<string, number> = {};
  claims.forEach((c: any) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  // Fraud detection: flag suspicious patterns
  const fraudAlerts: string[] = [];
  insurers.forEach((ins: any) => {
    const insClaims = claims.filter((c: any) => c.insurance_company_id === ins.id);
    const insPayments = payments.filter((p: any) => p.insurance_company_id === ins.id);
    const claimTotal = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const paidTotal = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    if (claimTotal > 0 && paidTotal / claimTotal < 0.3) {
      fraudAlerts.push(`⚠️ ${ins.company_name}: Only ${((paidTotal / claimTotal) * 100).toFixed(1)}% paid — potential default risk`);
    }
  });

  // Duplicate claim detection
  const claimsByPatient: Record<string, any[]> = {};
  claims.forEach((c: any) => {
    const key = `${c.patient_name}-${c.procedure_name}-${c.claim_month}/${c.claim_year}`;
    if (!claimsByPatient[key]) claimsByPatient[key] = [];
    claimsByPatient[key].push(c);
  });
  Object.entries(claimsByPatient).forEach(([key, dupes]) => {
    if (dupes.length > 1) fraudAlerts.push(`🔍 Possible duplicate: ${key} (${dupes.length} claims)`);
  });

  return `
## LIVE SYSTEM DATA (as of now):

### Summary
- Total Claims: ${claims.length} worth GH¢ ${totalClaimsAmount.toLocaleString()}
- Total Payments Received: GH¢ ${totalPaid.toLocaleString()}
- Total WHT Deducted: GH¢ ${totalTax.toLocaleString()}
- Outstanding: GH¢ ${outstanding.toLocaleString()}
- Pre-Authorizations: ${preauths.length}
- Insurance Companies: ${insurers.length}

### Claim Status Breakdown
${Object.entries(statusCounts).map(([s, c]) => `- ${s}: ${c}`).join("\n") || "No claims yet"}

### Insurance Companies
${insurers.map((i: any) => `- ${i.company_name} (${i.email || "no email"})`).join("\n") || "None registered"}

### Recent Claims (last 10)
${claims.slice(0, 10).map((c: any) => `- ${c.patient_name || "Unknown"} | ${c.procedure_name || "N/A"} | GH¢ ${Number(c.claim_amount).toLocaleString()} | ${c.status}`).join("\n") || "No claims"}

${fraudAlerts.length > 0 ? `### ⚠️ Fraud/Risk Alerts\n${fraudAlerts.join("\n")}` : "### No fraud alerts detected"}

### System Navigation Guide
- Dashboard: Overview with charts and KPIs
- Pre-Authorization: Create/manage approval requests (/pre-auth)
- Claims: Aggregated view by insurance company (/claims) — click company to see breakdown
- Payments: Record and track payments (/payments)
- Withholding Tax: WHT computation records (/withholding-tax)
- Reports: Generate Value/Volume schedules (/reports)
- Clients: Manage client companies (/clients)
- Doctors: Manage doctors (/doctors)
- Procedures: Manage procedure tariffs (/procedures)
- Users: User management and roles (/users)
- Settings: System configuration (/settings)
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch live system data for context
    let systemContext = "";
    try {
      systemContext = await getSystemContext();
    } catch (e) {
      console.error("Failed to fetch system context:", e);
      systemContext = "(System data unavailable — answer based on general knowledge)";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are the MedClaims AI Assistant — an expert in medical insurance claims management for healthcare facilities in Ghana.

You have access to LIVE system data injected below. Use it to give accurate, data-driven answers.

${systemContext}

You can help with:
- Explaining how to create pre-authorization requests (navigate to /pre-auth, click "New Request")
- Understanding claim statuses and workflows
- Interpreting payment and withholding tax data with real numbers
- Generating report insights from actual data
- Detecting anomalies and fraud patterns in claims
- Guiding users through the system's features step-by-step
- Analyzing insurance company performance
- Calculating outstanding amounts and payment delays
- Explaining ICD-10 diagnosis codes
- Helping with procedure tariff lookups

Keep answers clear, professional, and concise. Use markdown formatting. Use GH¢ as currency. When referencing data, use the actual numbers from the system. If asked about navigation, provide the exact page paths.

IMPORTANT: When detecting potential fraud or anomalies, be specific about which insurance company and what pattern you found.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
