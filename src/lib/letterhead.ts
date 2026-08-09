import type { BankingPartner, LetterheadConfig } from "./exportUtils";

export const LETTERHEAD_STYLES = [
  { value: "bar", label: "Accent bar + double rule" },
  { value: "rule", label: "Double rule only" },
  { value: "minimal", label: "Minimal (no rules)" },
] as const;

export function parseBankingPartners(raw?: string): BankingPartner[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.bank_name === "string") : [];
  } catch {
    return [];
  }
}

/** Builds the letterhead config from system_settings via a getter. */
export function buildLetterheadConfig(getS: (key: string) => string): LetterheadConfig {
  return {
    provider_name: getS("provider_name"),
    provider_address: getS("provider_address"),
    provider_phone: getS("provider_phone"),
    provider_email: getS("provider_email"),
    logo_url: getS("logo_url"),
    accent_color: getS("letterhead_accent") || "#1E4078",
    header_style: (getS("letterhead_style") || "bar") as LetterheadConfig["header_style"],
    show_banking: getS("letterhead_show_banking") !== "false",
    banking_partners: parseBankingPartners(getS("banking_partners")),
    footer_note: getS("letterhead_footer_note"),
  };
}
