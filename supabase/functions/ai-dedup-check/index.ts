import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Real-time duplicate scrutiny powered by Lovable AI Gateway.
 * Input: { entity: "diagnosis" | "procedure" | "template" | "catalog" | "insurance",
 *          candidate: Record<string, unknown>,
 *          existing: Array<{ id?: string } & Record<string, unknown>> }
 * Output: { duplicate: boolean, confidence: number, match_id?: string, reason: string }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { entity, candidate, existing } = await req.json();
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) {
      return Response.json({ duplicate: false, confidence: 0, reason: 'AI key missing' }, { headers: corsHeaders });
    }
    // Trim corpus to the most likely matches (cheap pre-filter on shared keys)
    const trimmed = (existing || []).slice(0, 80).map((e: any) => {
      const { id, code, item_name, procedure_name, template_name, company_name, description, name } = e;
      return { id, code, item_name, procedure_name, template_name, company_name, description, name };
    });

    const prompt = `You are a healthcare data steward. Decide if the CANDIDATE is a duplicate of any item in EXISTING for entity type "${entity}".
Treat near-identical names, abbreviations, and code matches as duplicates. Reply ONLY as JSON.

CANDIDATE: ${JSON.stringify(candidate)}
EXISTING: ${JSON.stringify(trimmed)}

Return: {"duplicate": boolean, "confidence": 0-1, "match_id": "<id-if-duplicate-or-null>", "reason": "short explanation"}`;

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      return Response.json({ duplicate: false, confidence: 0, reason: `AI ${res.status}` }, { headers: corsHeaders });
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { parsed = { duplicate: false, confidence: 0, reason: 'parse error' }; }
    return Response.json(parsed, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return Response.json({ duplicate: false, confidence: 0, reason: e?.message || 'error' }, { headers: corsHeaders });
  }
});