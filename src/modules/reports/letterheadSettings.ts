export type LetterheadRpcError = {
  code?: string;
  message?: string;
};

export function isMissingLetterheadSettingsRpc(error: LetterheadRpcError | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202"
    || error.code === "42883"
    || /get_report_letterhead_settings.*(does not exist|not found)|could not find the function/i.test(error.message ?? "");
}
