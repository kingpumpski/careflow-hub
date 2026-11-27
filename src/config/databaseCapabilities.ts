export type DatabaseCapabilityEnvironment = {
  VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED?: string;
  VITE_CAREFLOW_CLAIM_CASES_ENABLED?: string;
  VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED?: string;
  VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED?: string;
};

export type DatabaseCapabilities = {
  preAuthPreparedHandoff: boolean;
  individualClaimCases: boolean;
  settlementExceptions: boolean;
  settlementRemittanceLedger: boolean;
};

/**
 * Production capabilities are opt-in at build time. This prevents the app
 * from calling relations/RPCs that have not passed the production migration
 * and release checks. Only the exact string "true" enables a capability.
 */
export function resolveDatabaseCapabilities(
  environment: DatabaseCapabilityEnvironment,
): DatabaseCapabilities {
  return Object.freeze({
    preAuthPreparedHandoff: environment.VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED === "true",
    individualClaimCases: environment.VITE_CAREFLOW_CLAIM_CASES_ENABLED === "true",
    settlementExceptions: environment.VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED === "true",
    settlementRemittanceLedger: environment.VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED === "true",
  });
}

export const databaseCapabilities = resolveDatabaseCapabilities(import.meta.env);
