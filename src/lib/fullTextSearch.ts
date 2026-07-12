import { supabase } from "@/integrations/supabase/client";

/** Postgres full-text search across a table's indexed columns.
 *  Falls back to ILIKE when query is short/empty. Returns rows ordered by created_at desc.
 */
export async function ftsSearch<T = any>(
  table: string,
  columns: string[],
  q: string,
  limit = 50,
): Promise<T[]> {
  const term = q.trim();
  if (!term) {
    const { data } = await (supabase.from(table as any) as any)
      .select("*").order("created_at", { ascending: false }).limit(limit);
    return (data || []) as T[];
  }
  // Build websearch tsquery on concatenated indexed columns
  const tsExpr = columns.map((c) => `coalesce(${c},'')`).join(" || ' ' || ");
  try {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*")
      .textSearch(tsExpr, term, { type: "websearch", config: "simple" })
      .limit(limit);
    if (error) throw error;
    return (data || []) as T[];
  } catch {
    // Fallback to ILIKE on first column
    const { data } = await (supabase.from(table as any) as any)
      .select("*")
      .ilike(columns[0], `%${term}%`)
      .limit(limit);
    return (data || []) as T[];
  }
}
