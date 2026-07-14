import { useEffect, useMemo, useState } from "react";
import { ftsSearch } from "@/lib/fullTextSearch";

/**
 * Postgres full-text search wired to any master/catalog list.
 * - When the search term is <2 chars, returns the fallback dataset unchanged.
 * - Otherwise runs a debounced FTS query and intersects the resulting ids
 *   with the fallback so page-level filters (archived, active, etc.) still work.
 */
export function useMasterSearch<T = any>(
  table: string,
  columns: string[],
  search: string,
  fallback: T[] | undefined,
): T[] {
  const q = search.trim();
  const [debounced, setDebounced] = useState(q);
  const [remote, setRemote] = useState<T[] | null>(null);
  const colsKey = columns.join(",");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) { setRemote(null); return; }
    let cancel = false;
    ftsSearch<T>(table, columns, debounced, 200)
      .then((rows) => { if (!cancel) setRemote(rows); })
      .catch(() => { if (!cancel) setRemote(null); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, table, colsKey]);

  return useMemo(() => {
    if (q.length < 2 || !remote) return fallback || [];
    const ids = new Set(remote.map((r: any) => r.id));
    if (fallback && fallback.length) return fallback.filter((r: any) => ids.has(r.id));
    return remote;
  }, [remote, fallback, q]);
}