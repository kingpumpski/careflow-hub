/**
 * Some deployments run ahead of the database: tables and helper functions that
 * the UI expects may not exist yet. Instead of hard-failing (and flooding the
 * console with unhandled query errors), we detect those cases and degrade
 * gracefully so users — especially administrators — keep full access to the
 * sections that do work.
 */

const MISSING_RELATION_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export function isMissingSchemaError(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as { code?: string; message?: string; details?: string; status?: number };
  if (candidate.code && MISSING_RELATION_CODES.has(candidate.code)) return true;
  const text = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    text.includes("does not exist") ||
    text.includes("could not find the table") ||
    text.includes("could not find the function") ||
    text.includes("schema cache")
  );
}

let facilityInfrastructureAvailable = true;

/** Records that facility scoping tables are unavailable in this environment. */
export function markFacilityInfrastructureUnavailable(): void {
  facilityInfrastructureAvailable = false;
}

export function isFacilityInfrastructureAvailable(): boolean {
  return facilityInfrastructureAvailable;
}
