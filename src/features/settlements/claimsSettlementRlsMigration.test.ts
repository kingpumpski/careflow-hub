import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123141000_enforce_claims_settlement_scoped_rls.sql'),
  'utf8',
);

describe('claims settlement scoped RLS migration contract', () => {
  it('requires facility membership and a scoped read or existing finance read permission', () => {
    expect(migration).toMatch(/user_has_facility_access\(facility_id\)/i);
    expect(migration).toMatch(/current_user_has_permission\('payments\.read'\)/i);
    expect(migration).toMatch(/current_user_has_permission\('claims\.settlement\.read'\)/i);
  });

  it('requires scoped settlement write or existing payment write for inserts and updates', () => {
    expect(migration).toMatch(/current_user_has_permission\('payments\.write'\)/i);
    expect(migration).toMatch(/current_user_has_permission\('claims\.settlement\.write'\)/i);
    expect(migration).toMatch(/created_by = \(SELECT auth\.uid\(\)\)/i);
  });

  it('does not grant data-entry officers settlement write access', () => {
    expect(migration).not.toMatch(/'data_entry_officer'/i);
  });
});
