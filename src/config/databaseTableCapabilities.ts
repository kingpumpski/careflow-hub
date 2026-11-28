import { databaseCapabilities, type DatabaseCapabilities } from "./databaseCapabilities";

export type DatabaseCapabilityKey = keyof DatabaseCapabilities;

const TABLE_CAPABILITIES: Readonly<Record<string, DatabaseCapabilityKey>> = Object.freeze({
  preauthorization_submissions: "preAuthPreparedHandoff",
  claim_cases: "individualClaimCases",
  claim_case_events: "individualClaimCases",
  settlement_exceptions: "settlementExceptions",
  settlement_exception_audit_events: "settlementExceptions",
  claims_settlement_remittances: "settlementRemittanceLedger",
  claims_settlement_receipt_months: "settlementRemittanceLedger",
  claim_diagnosis_drafts: "claimDiagnosisDrafts",
});

const RPC_CAPABILITIES: Readonly<Record<string, DatabaseCapabilityKey>> = Object.freeze({
  finalize_preauthorization_handoff: "preAuthPreparedHandoff",
  create_individual_claim_case: "individualClaimCases",
  transition_individual_claim_case: "individualClaimCases",
  record_settlement_exception: "settlementExceptions",
  transition_settlement_exception_atomic: "settlementExceptions",
  record_claims_settlement_remittance: "settlementRemittanceLedger",
  reverse_claims_settlement_remittance: "settlementRemittanceLedger",
  create_facility_with_owner: "facilityAdministration",
  add_facility_member_by_email: "facilityAdministration",
  deactivate_facility_member: "facilityAdministration",
  set_facility_provisional_wht_rate: "facilityAdministration",
  get_report_letterhead_settings: "documentLetterheadSettings",
  get_facility_letterhead_settings: "facilityLetterheadSettings",
  save_facility_letterhead_settings: "facilityLetterheadSettings",
});

export function getDatabaseCapabilityForResource(resource: string): DatabaseCapabilityKey | null {
  if (Object.prototype.hasOwnProperty.call(TABLE_CAPABILITIES, resource)) return TABLE_CAPABILITIES[resource];
  if (Object.prototype.hasOwnProperty.call(RPC_CAPABILITIES, resource)) return RPC_CAPABILITIES[resource];
  return null;
}

export function isDatabaseCapabilityAvailable(
  resource: string,
  capabilities: DatabaseCapabilities = databaseCapabilities,
): boolean {
  const required = getDatabaseCapabilityForResource(resource);
  return required === null || capabilities[required];
}

export class DatabaseCapabilityUnavailableError extends Error {
  readonly resource: string;
  readonly capability: DatabaseCapabilityKey;

  constructor(resource: string, capability: DatabaseCapabilityKey) {
    super(`The ${resource} data source is not enabled in this deployment. Its database contract must pass release checks before it can be used.`);
    this.name = "DatabaseCapabilityUnavailableError";
    this.resource = resource;
    this.capability = capability;
  }
}

export function assertDatabaseCapabilityAvailable(
  resource: string,
  capabilities: DatabaseCapabilities = databaseCapabilities,
): void {
  const required = getDatabaseCapabilityForResource(resource);
  if (required && !capabilities[required]) {
    throw new DatabaseCapabilityUnavailableError(resource, required);
  }
}

/**
 * Facility-owned offline rows are only hydrated when an explicit facility is
 * selected. Rows without a facility_id are reference/global rows and remain
 * subject to their server-side RLS and, once implemented, organization scope.
 */
export function isRowInSelectedFacilityScope(
  row: Record<string, unknown>,
  facilityId: string | null,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(row, "facility_id")) return true;
  return Boolean(facilityId) && row.facility_id === facilityId;
}
