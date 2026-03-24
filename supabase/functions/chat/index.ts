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

  const [claimsRes, paymentsRes, preauthRes, insurersRes, taxRes, ledgerRes] = await Promise.all([
    supabase.from("claims").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("pre_authorizations").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("insurance_companies").select("*"),
    supabase.from("withholding_tax").select("*").limit(100),
    supabase.from("ledger_entries").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const claims = claimsRes.data || [];
  const payments = paymentsRes.data || [];
  const preauths = preauthRes.data || [];
  const insurers = insurersRes.data || [];
  const tax = taxRes.data || [];
  const ledger = ledgerRes.data || [];

  const submittedClaims = claims.filter((c: any) => c.status !== "rejected");
  const rejectedClaims = claims.filter((c: any) => c.status === "rejected");
  const totalSubmitted = submittedClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const totalRejected = rejectedClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
  const netClaim = totalSubmitted - totalRejected;
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
  const totalTax = tax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
  const outstanding = netClaim - totalPaid - totalTax;

  // Per-company breakdown
  const companyBreakdown = insurers.map((ins: any) => {
    const insClaims = submittedClaims.filter((c: any) => c.insurance_company_id === ins.id);
    const insRejected = rejectedClaims.filter((c: any) => c.insurance_company_id === ins.id);
    const insPayments = payments.filter((p: any) => p.insurance_company_id === ins.id);
    const insTax = tax.filter((t: any) => t.insurance_company_id === ins.id);
    const sub = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const rej = insRejected.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const net = sub - rej;
    const paid = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    const wht = insTax.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    const outs = net - paid - wht;
    return `- ${ins.company_name}: Submitted GH¢${sub.toLocaleString()} | Rejected GH¢${rej.toLocaleString()} | Net GH¢${net.toLocaleString()} | Paid GH¢${paid.toLocaleString()} | WHT GH¢${wht.toLocaleString()} | Outstanding GH¢${outs.toLocaleString()}`;
  }).filter((line: string) => !line.includes("Submitted GH¢0"));

  // Fraud detection
  const fraudAlerts: string[] = [];
  insurers.forEach((ins: any) => {
    const insClaims = submittedClaims.filter((c: any) => c.insurance_company_id === ins.id);
    const insPayments = payments.filter((p: any) => p.insurance_company_id === ins.id);
    const claimTotal = insClaims.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
    const paidTotal = insPayments.reduce((s: number, p: any) => s + Number(p.amount_paid || 0), 0);
    if (claimTotal > 0 && paidTotal / claimTotal < 0.3) {
      fraudAlerts.push(`⚠️ ${ins.company_name}: Only ${((paidTotal / claimTotal) * 100).toFixed(1)}% paid — potential default risk`);
    }
  });

  // Monthly trend
  const monthlyTrend: Record<string, { submitted: number; paid: number; rejected: number }> = {};
  claims.forEach((c: any) => {
    const key = `${c.claim_year}-${String(c.claim_month).padStart(2, "0")}`;
    if (!monthlyTrend[key]) monthlyTrend[key] = { submitted: 0, paid: 0, rejected: 0 };
    if (c.status === "rejected") monthlyTrend[key].rejected += Number(c.claim_amount || 0);
    else monthlyTrend[key].submitted += Number(c.claim_amount || 0);
  });
  payments.forEach((p: any) => {
    const d = new Date(p.payment_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyTrend[key]) monthlyTrend[key].paid += Number(p.amount_paid || 0);
  });

  return `
## LIVE SYSTEM DATA (as of now):

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

${fraudAlerts.length > 0 ? `### ⚠️ Risk Alerts\n${fraudAlerts.join("\n")}` : "### No risk alerts"}

### System Navigation
- Dashboard: /dashboard — KPIs and charts
- Claims Management: /claims — Submit claims, view aggregated totals, drill down per company
- Payments: /payments — Record payments, view history per company
- Withholding Tax: /withholding-tax — Auto-calculated WHT records
- Outstanding: /outstanding — Net outstanding balances per company
- Rejections: /rejections — Track rejected claims
- Pre-Authorization: /pre-auth — Create/edit authorization requests
- Reports: /reports — Generate period-based reconciliation reports
- General Ledger: /ledger — Double-entry accounting journal
- Settings: /settings — Provider info, tax rate, logo upload
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemContext = "";
    try {
      systemContext = await getSystemContext();
    } catch (e) {
      console.error("Failed to fetch system context:", e);
      systemContext = "(System data unavailable)";
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
            content: `You are the MedClaims AI Assistant — an expert in medical insurance claims management, accounting, and financial analysis for healthcare facilities in Ghana.

You have access to LIVE system data below. Use it for accurate, data-driven answers.

${systemContext}

## ACCOUNTING KNOWLEDGE

You understand and can explain these accounting principles:

### Core Formulas
- Net Claim = Submitted Claims - Rejections
- Outstanding = Net Claim - Payments - Withholding Tax
- Withholding Tax = Tax Rate × Net Claim Amount

### Double-Entry Accounting
Every transaction creates journal entries:
- **Claim Submission**: Dr Accounts Receivable | Cr Claims Revenue
- **Rejection**: Dr Revenue Adjustment | Cr Accounts Receivable
- **Payment Received**: Dr Cash/Bank | Cr Accounts Receivable
- **Withholding Tax**: Dr WHT Expense | Cr WHT Payable

### Claims Lifecycle
Submitted → (Rejected if applicable) → Net Claim → WHT Applied → Payment Received → Outstanding Settled

### Accounting Standards
- **Accrual Accounting**: Revenue recognized when claim is submitted, not when payment received
- **Matching Principle**: WHT expense matched to the period of the claim
- **Revenue Recognition**: Claims revenue recorded at submission
- **Prudence Concept**: Outstanding amounts reflect conservative estimates
- **Consistency Principle**: Same WHT rate applied uniformly
- **Materiality**: Focus on significant variances and anomalies

## CAPABILITIES

You can help with:
1. **Smart Queries**: "What is outstanding for ACACIA?" "Why is WHT high this month?"
2. **Financial Explanations**: Explain how figures are derived, trace entries through the ledger
3. **Reconciliation**: Help prepare for meetings by summarizing account positions
4. **Fraud Detection**: Flag duplicate claims, payment delays, abnormal spikes
5. **Report Generation**: Describe how to generate monthly/quarterly/annual reports
6. **Navigation**: Guide users to the right page with exact paths
7. **Error Detection**: Flag missing payments, incorrect tax calculations, imbalances
8. **Trend Analysis**: Identify payment patterns and revenue trends

Keep answers clear, professional, and data-driven. Use GH¢ as currency. Use actual numbers from the system. When detecting anomalies, be specific about which company and what pattern.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
