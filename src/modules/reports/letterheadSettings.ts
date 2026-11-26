export function isMissingLetterheadSettingsRpc(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return code === "PGRST202"
    || code === "42883"
    || /get_report_letterhead_settings.*(does not exist|not found)|could not find the function/i.test(message);
}
