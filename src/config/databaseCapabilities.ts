export type DatabaseCapabilityEnvironment = {
  VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED?: string;
  VITE_CAREFLOW_CLAIM_CASES_ENABLED?: string;
  VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED?: string;
  VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED?: string;
  VITE_CAREFLOW_FACILITY_ADMIN_ENABLED?: string;
  VITE_CAREFLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED?: string;
  VITE_CAREFLOW_NOTIFICATION_EVENTS_ENABLED?: string;
  VITE_CAREFLOW_DOCUMENT_LETTERHEAD_ENABLED?: string;
  VITE_CAREFLOW_WHT_CERTIFICATE_RECEIPTS_ENABLED?: string;
  VITE_CAREFLOW_FACILITY_LETTERHEAD_ENABLED?: string;
};

export type DatabaseCapabilities = {
  preAuthPreparedHandoff: boolean;
  individualClaimCases: boolean;
  settlementExceptions: boolean;
  settlementRemittanceLedger: boolean;
  facilityAdministration: boolean;
  claimDiagnosisDrafts: boolean;
  notificationEvents: boolean;
  documentLetterheadSettings: boolean;
  withholdingTaxCertificateReceipts: boolean;
  facilityLetterheadSettings: boolean;
};

/**
 * These are environment-wide release/kill switches only. They prevent the
 * app from calling relations/RPCs that have not passed production release
 * checks. They are NOT organization entitlements or user permissions.
 * Per-organization module availability must be resolved server-side from the
 * organization entitlement model after organization tenancy is implemented.
 * Only the exact string "true" enables a capability.
 */
export function resolveDatabaseCapabilities(
  environment: DatabaseCapabilityEnvironment,
): DatabaseCapabilities {
  return Object.freeze({
    preAuthPreparedHandoff: environment.VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED === "true",
    individualClaimCases: environment.VITE_CAREFLOW_CLAIM_CASES_ENABLED === "true",
    settlementExceptions: environment.VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED === "true",
    settlementRemittanceLedger: environment.VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED === "true",
    facilityAdministration: environment.VITE_CAREFLOW_FACILITY_ADMIN_ENABLED === "true",
    claimDiagnosisDrafts: environment.VITE_CAREFLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED === "true",
    notificationEvents: environment.VITE_CAREFLOW_NOTIFICATION_EVENTS_ENABLED === "true",
    documentLetterheadSettings: environment.VITE_CAREFLOW_DOCUMENT_LETTERHEAD_ENABLED === "true",
    withholdingTaxCertificateReceipts: environment.VITE_CAREFLOW_WHT_CERTIFICATE_RECEIPTS_ENABLED === "true",
    facilityLetterheadSettings: environment.VITE_CAREFLOW_FACILITY_LETTERHEAD_ENABLED === "true",
  });
}

export const databaseCapabilities = resolveDatabaseCapabilities(import.meta.env);
