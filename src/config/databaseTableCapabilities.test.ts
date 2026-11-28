import { describe, expect, it } from "vitest";
import {
  assertDatabaseCapabilityAvailable,
  DatabaseCapabilityUnavailableError,
  getDatabaseCapabilityForResource,
  isDatabaseCapabilityAvailable,
  isRowInSelectedFacilityScope,
} from "./databaseTableCapabilities";
import type { DatabaseCapabilities } from "./databaseCapabilities";

const disabled: DatabaseCapabilities = {
  preAuthPreparedHandoff: false,
  individualClaimCases: false,
  settlementExceptions: false,
  settlementRemittanceLedger: false,
  facilityAdministration: false,
  claimDiagnosisDrafts: false,
  notificationEvents: false,
  documentLetterheadSettings: false,
};
const enabled: DatabaseCapabilities = {
  preAuthPreparedHandoff: true,
  individualClaimCases: true,
  settlementExceptions: true,
  settlementRemittanceLedger: true,
  facilityAdministration: true,
  claimDiagnosisDrafts: true,
  notificationEvents: true,
  documentLetterheadSettings: true,
};

describe("database table and RPC capability contracts", () => {
  it("maps every unreleased table to its matching release capability", () => {
    expect(getDatabaseCapabilityForResource("preauthorization_submissions")).toBe("preAuthPreparedHandoff");
    expect(getDatabaseCapabilityForResource("claim_cases")).toBe("individualClaimCases");
    expect(getDatabaseCapabilityForResource("claim_case_events")).toBe("individualClaimCases");
    expect(getDatabaseCapabilityForResource("settlement_exceptions")).toBe("settlementExceptions");
    expect(getDatabaseCapabilityForResource("settlement_exception_audit_events")).toBe("settlementExceptions");
    expect(getDatabaseCapabilityForResource("claims_settlement_remittances")).toBe("settlementRemittanceLedger");
    expect(getDatabaseCapabilityForResource("claims_settlement_receipt_months")).toBe("settlementRemittanceLedger");
    expect(getDatabaseCapabilityForResource("claim_diagnosis_drafts")).toBe("claimDiagnosisDrafts");
  });

  it("maps privileged RPCs to the same capability as their tables", () => {
    expect(getDatabaseCapabilityForResource("finalize_preauthorization_handoff")).toBe("preAuthPreparedHandoff");
    expect(getDatabaseCapabilityForResource("create_individual_claim_case")).toBe("individualClaimCases");
    expect(getDatabaseCapabilityForResource("transition_individual_claim_case")).toBe("individualClaimCases");
    expect(getDatabaseCapabilityForResource("record_settlement_exception")).toBe("settlementExceptions");
    expect(getDatabaseCapabilityForResource("transition_settlement_exception_atomic")).toBe("settlementExceptions");
    expect(getDatabaseCapabilityForResource("record_claims_settlement_remittance")).toBe("settlementRemittanceLedger");
    expect(getDatabaseCapabilityForResource("reverse_claims_settlement_remittance")).toBe("settlementRemittanceLedger");
    expect(getDatabaseCapabilityForResource("create_facility_with_owner")).toBe("facilityAdministration");
    expect(getDatabaseCapabilityForResource("add_facility_member_by_email")).toBe("facilityAdministration");
    expect(getDatabaseCapabilityForResource("deactivate_facility_member")).toBe("facilityAdministration");
    expect(getDatabaseCapabilityForResource("set_facility_provisional_wht_rate")).toBe("facilityAdministration");
    expect(getDatabaseCapabilityForResource("get_report_letterhead_settings")).toBe("documentLetterheadSettings");
  });

  it("keeps base tables available while optional database capabilities are disabled", () => {
    expect(isDatabaseCapabilityAvailable("claims", disabled)).toBe(true);
    expect(isDatabaseCapabilityAvailable("claims_settlement_periods", disabled)).toBe(true);
    expect(isDatabaseCapabilityAvailable("payments", disabled)).toBe(true);
    expect(isDatabaseCapabilityAvailable("claim_cases", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("claim_diagnosis_drafts", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("settlement_exceptions", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("create_facility_with_owner", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("get_report_letterhead_settings", disabled)).toBe(false);
    expect(isDatabaseCapabilityAvailable("get_report_letterhead_settings", enabled)).toBe(true);
  });

  it("throws a typed error instead of permitting an unreleased mutation", () => {
    expect(() => assertDatabaseCapabilityAvailable("claims_settlement_remittances", disabled))
      .toThrow(DatabaseCapabilityUnavailableError);
    expect(() => assertDatabaseCapabilityAvailable("claims_settlement_periods", disabled)).not.toThrow();
    expect(isDatabaseCapabilityAvailable("claims_settlement_remittances", enabled)).toBe(true);
    expect(isDatabaseCapabilityAvailable("claim_diagnosis_drafts", enabled)).toBe(true);
  });
});

describe("offline facility hydration scope", () => {
  it("does not hydrate facility-owned rows without an active facility", () => {
    expect(isRowInSelectedFacilityScope({ id: "a", facility_id: "facility-a" }, null)).toBe(false);
    expect(isRowInSelectedFacilityScope({ id: "a", facility_id: "facility-a" }, "facility-b")).toBe(false);
  });

  it("hydrates only rows belonging to the explicitly selected facility", () => {
    expect(isRowInSelectedFacilityScope({ id: "a", facility_id: "facility-a" }, "facility-a")).toBe(true);
  });

  it("keeps rows without a facility key eligible for RLS-filtered reference hydration", () => {
    expect(isRowInSelectedFacilityScope({ id: "insurer-a", company_name: "Insurer A" }, null)).toBe(true);
  });
});
