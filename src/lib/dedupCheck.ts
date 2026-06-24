import { supabase } from "@/integrations/supabase/client";

export type DedupEntity = "diagnosis" | "procedure" | "template" | "catalog" | "insurance";

export interface DedupResult {
  duplicate: boolean;
  confidence: number;
  match_id?: string | null;
  reason: string;
}

/** Deterministic exact-match pre-check (case-insensitive trim) on the chosen field(s). */
export function localDuplicate(
  candidate: Record<string, any>,
  existing: Array<Record<string, any>>,
  keys: string[],
): Record<string, any> | null {
  const norm = (v: any) => String(v ?? "").trim().toLowerCase();
  for (const row of existing || []) {
    if (keys.every((k) => candidate[k] != null && norm(candidate[k]) === norm(row[k]))) {
      return row;
    }
  }
  return null;
}

/** AI scrutiny via edge function (Gemini Flash). Falls back to non-duplicate if AI is unavailable. */
export async function aiDuplicateCheck(
  entity: DedupEntity,
  candidate: Record<string, any>,
  existing: Array<Record<string, any>>,
): Promise<DedupResult> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-dedup-check", {
      body: { entity, candidate, existing },
    });
    if (error) return { duplicate: false, confidence: 0, reason: error.message };
    return data as DedupResult;
  } catch (e: any) {
    return { duplicate: false, confidence: 0, reason: e?.message || "ai unreachable" };
  }
}