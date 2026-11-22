import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("monthly claim submission permission", () => {
  it("allows claims roles to submit monthly aggregate claims", () => {
    expect(hasPermission(["claims_officer"], "claims.submit_monthly")).toBe(true);
    expect(hasPermission(["data_entry_officer"], "claims.submit_monthly")).toBe(true);
    expect(hasPermission(["admin"], "claims.submit_monthly")).toBe(true);
    expect(hasPermission(["superuser"], "claims.submit_monthly")).toBe(true);
  });

  it("does not grant general finance write permissions to claims roles", () => {
    expect(hasPermission(["claims_officer"], "payments.write")).toBe(false);
    expect(hasPermission(["claims_officer"], "ledger.write")).toBe(false);
    expect(hasPermission(["data_entry_officer"], "payments.write")).toBe(false);
    expect(hasPermission(["data_entry_officer"], "ledger.write")).toBe(false);
  });

  it("does not grant monthly submission to read-only or finance-only roles", () => {
    expect(hasPermission(["viewer"], "claims.submit_monthly")).toBe(false);
    expect(hasPermission(["auditor"], "claims.submit_monthly")).toBe(false);
    expect(hasPermission(["accounts_officer"], "claims.submit_monthly")).toBe(false);
  });
});
