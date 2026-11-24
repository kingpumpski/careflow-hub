import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG, ROLE_PERMISSIONS, hasPermission } from './permissions';

describe('claims settlement permission boundary', () => {
  it('defines separate read and write permissions for claim settlement advice', () => {
    expect(PERMISSION_CATALOG.map((permission) => permission.key)).toContain('claims.settlement.read');
    expect(PERMISSION_CATALOG.map((permission) => permission.key)).toContain('claims.settlement.write');
  });

  it('allows claims officers to read and record settlement advice without general finance write access', () => {
    expect(hasPermission(['claims_officer'], 'claims.settlement.read')).toBe(true);
    expect(hasPermission(['claims_officer'], 'claims.settlement.write')).toBe(true);
    expect(hasPermission(['claims_officer'], 'payments.write')).toBe(false);
    expect(hasPermission(['claims_officer'], 'ledger.write')).toBe(false);
  });

  it('does not grant settlement write access to data-entry, auditor or viewer roles', () => {
    expect(hasPermission(['data_entry_officer'], 'claims.settlement.write')).toBe(false);
    expect(hasPermission(['auditor'], 'claims.settlement.write')).toBe(false);
    expect(hasPermission(['viewer'], 'claims.settlement.write')).toBe(false);
  });

  it('keeps finance officer access through existing payment permissions', () => {
    expect(ROLE_PERMISSIONS.accounts_officer).toContain('payments.read');
    expect(ROLE_PERMISSIONS.accounts_officer).toContain('payments.write');
  });
});



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
