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
