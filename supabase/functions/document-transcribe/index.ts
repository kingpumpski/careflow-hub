import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const MAX_BODY_BYTES = 11_000_000;
const MAX_DOCUMENT_BYTES = 8_000_000;
const isAllowedOrigin = (origin: string | null) => !origin || allowedOrigins.includes(origin) || /^https?:\/\/localhost:\d+$/.test(origin) || /^https:\/\/[-a-z0-9]+\.app\.github\.dev$/.test(origin);
const cors = (req: Request) => {
  const origin = req.headers.get("Origin");
  return { ...(isAllowedOrigin(origin) && origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
};
const json = (req: Request, body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

function extractJson(value: string): Record<string, unknown> {
  const cleaned = value.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return structured JSON");
  return JSON.parse(match[0]);
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid document payload");
  const metadata = dataUrl.slice(0, comma);
  if (!/;base64$/i.test(metadata)) throw new Error("Only base64 document payloads are supported");
  const binary = atob(dataUrl.slice(comma + 1));
  if (binary.length > MAX_DOCUMENT_BYTES) throw new Error("DOCUMENT_TOO_LARGE");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const loadingTask = getDocument({ data: bytes, disableWorker: true, useWorkerFetch: false, isEvalSupported: false, verbosity: 0 });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages && pages.join("\n").length < 100_000; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item: { str?: string }) => item.str ?? "").join(" ").trim();
      if (text) pages.push(`PAGE ${pageNumber}\n${text}`);
    }
  } finally {
    await pdf.destroy();
  }
  return pages.join("\n\n").slice(0, 100_000);
}

async function requireAuthorizedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization?.startsWith("Bearer ") || !url || !anon) throw new Error("AUTH_REQUIRED");
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) throw new Error("AUTH_REQUIRED");

  // Document intake can create operational records, so require at least one relevant write capability.
  const writePermissions = ["claims.write", "payments.write", "preauth.write", "masterdata.write", "ledger.write"];
  const permissionResults = await Promise.all(writePermissions.map((permission) =>
    userClient.rpc("current_user_has_permission", { p_permission_key: permission }),
  ));
  if (!permissionResults.some(({ data, error }) => !error && data === true)) throw new Error("FORBIDDEN");
  return userClient;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    if (!isAllowedOrigin(req.headers.get("Origin"))) return json(req, { error: "Origin not allowed" }, 403);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json(req, { error: "Document payload is too large. Please use a file below 8 MB." }, 413);

    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) return json(req, { error: "Document transcription service is not configured." }, 503);
    await requireAuthorizedUser(req);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const fileName = typeof body?.file_name === "string" ? body.file_name.slice(0, 180) : "uploaded document";
    const mimeType = typeof body?.mime_type === "string" ? body.mime_type.slice(0, 120).toLowerCase() : "application/octet-stream";
    const text = typeof body?.text === "string" ? body.text.slice(0, 100_000) : null;
    const dataUrl = typeof body?.data_url === "string" ? body.data_url : null;
    if (!text && !dataUrl) return json(req, { error: "No document content supplied." }, 400);
    if (dataUrl && dataUrl.length > 11_000_000) return json(req, { error: "Document payload is too large. Please use a file below 8 MB." }, 413);

    let sourceText = text;
    let imageDataUrl: string | null = null;
    if (dataUrl) {
      if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName)) {
        const bytes = decodeDataUrl(dataUrl);
        sourceText = await extractPdfText(bytes);
        if (!sourceText.trim()) return json(req, { error: "The PDF contains no extractable text. Please use a text-based PDF or provide a clear page image." }, 422);
      } else if (mimeType.startsWith("image/")) {
        imageDataUrl = dataUrl;
      } else {
        return json(req, { error: "This document format requires text extraction before AI transcription. Use PDF, image, spreadsheet, CSV, JSON or text input." }, 415);
      }
    }

    const instructions = `You are CareFlow Hub's document intake engine. Read the supplied operational document and return ONLY valid JSON with this shape: {"transcript":"plain-language transcription/summary of factual source content","records":[{"entity":"insurance_company|claim|payment|withholding_tax","data":{},"confidence":0.0,"source":"optional source location"}],"warnings":["..."]}. Never invent values. Preserve source numbers exactly where possible. Only create a record when the document provides enough evidence. For claims use data fields insurance_company_id only when a real UUID is present, claim_amount, claim_month, claim_year, status. For payments use insurance_company_id, amount_paid, payment_date. For withholding_tax use insurance_company_id and tax_amount. For insurance_company use company_name and optional is_active. If the source names an insurer but gives no UUID, put the insurer name in data.insurance_company_name instead and add a warning that human mapping is required. Do not create patient diagnoses, clinical conclusions, credentials, secrets, or fabricated identifiers. Confidence must be between 0 and 1.`;

    const userContent: unknown = imageDataUrl
      ? [{ type: "text", text: `${instructions}\nFile: ${fileName}\nMIME type: ${mimeType}` }, { type: "image_url", image_url: { url: imageDataUrl } }]
      : `${instructions}\nFile: ${fileName}\nMIME type: ${mimeType}\n\nSOURCE CONTENT:\n${sourceText ?? ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", temperature: 0, messages: [{ role: "system", content: instructions }, { role: "user", content: userContent }] }),
    });
    if (!response.ok) {
      if (response.status === 429) return json(req, { error: "Transcription rate limit reached. Please try again shortly." }, 429);
      if (response.status === 402) return json(req, { error: "AI usage limit reached. Configure the document-intake AI service before retrying." }, 402);
      console.error("document transcription gateway error", response.status);
      return json(req, { error: "The document transcription service is temporarily unavailable." }, 502);
    }
    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("AI transcription response was empty");
    const parsed = extractJson(content);
    return json(req, {
      transcript: typeof parsed.transcript === "string" ? parsed.transcript.slice(0, 50_000) : "",
      records: Array.isArray(parsed.records) ? parsed.records.slice(0, 500) : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === "string").slice(0, 50) : [],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return json(req, { error: "Authentication required" }, 401);
    if (error instanceof Error && error.message === "FORBIDDEN") return json(req, { error: "Insufficient permission" }, 403);
    if (error instanceof Error && error.message === "DOCUMENT_TOO_LARGE") return json(req, { error: "Document exceeds the 8 MB limit." }, 413);
    console.error("document-transcribe failed", error);
    return json(req, { error: "Unable to transcribe the supplied document." }, 500);
  }
});
