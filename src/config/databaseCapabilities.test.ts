import { describe, expect, it } from "vitest";
import { resolveDatabaseCapabilities } from "./databaseCapabilities";

describe("resolveDatabaseCapabilities", () => {
  it("keeps unreleased database capabilities disabled by default", () => {
    expect(resolveDatabaseCapabilities({})).toEqual({
      preAuthPreparedHandoff: false,
      individualClaimCases: false,
      settlementExceptions: false,
      settlementRemittanceLedger: false,
      facilityAdministration: false,
      claimDiagnosisDrafts: true,
      claimDiagnosisDrafts: false,
    });
  });

  it("enables only capabilities explicitly set to the exact string true", () => {
    expect(resolveDatabaseCapabilities({
      VITE_CAREFLOW_PREAUTH_HANDOFF_ENABLED: "true",
      VITE_CAREFLOW_CLAIM_CASES_ENABLED: "TRUE",
      VITE_CAREFLOW_SETTLEMENT_EXCEPTIONS_ENABLED: "1",
      VITE_CAREFLOW_SETTLEMENT_REMITTANCES_ENABLED: "true",
      VITE_CAREFLOW_FACILITY_ADMIN_ENABLED: "false",
      VITE_CAREFLOW_CLAIM_DIAGNOSIS_DRAFTS_ENABLED: "true",
    })).toEqual({
      preAuthPreparedHandoff: true,
      individualClaimCases: false,
      settlementExceptions: false,
      settlementRemittanceLedger: true,
      facilityAdministration: false,
    });
  });
});
