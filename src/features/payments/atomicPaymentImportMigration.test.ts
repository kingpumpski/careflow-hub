import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123130000_harden_atomic_payment_import_validation.sql'),
  'utf8',
);

describe('atomic payment import migration contract', () => {
  it('keeps payment and ledger inserts in one SECURITY INVOKER transaction', () => {
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).toMatch(/INSERT INTO public\.payments/i);
    expect(migration).toMatch(/INSERT INTO public\.ledger_entries/i);
    expect(migration).not.toMatch(/SECURITY DEFINER/i);
  });

  it('validates positive two-decimal amounts and bounded claim periods', () => {
    expect(migration).toMatch(/v_amount <= 0 OR v_amount <> round\(v_amount, 2\)/i);
    expect(migration).toMatch(/v_claim_month < 1 OR v_claim_month > 12/i);
    expect(migration).toMatch(/v_claim_year < 1 OR v_claim_year > 9999/i);
    expect(migration).toMatch(/jsonb_array_length\(p_rows\) > 5000/i);
  });

  it('rejects unavailable or inactive insurers before posting', () => {
    expect(migration).toMatch(/is_active IS DISTINCT FROM false/i);
    expect(migration).toMatch(/unavailable or inactive/i);
  });

  it('restricts RPC execution to authenticated callers', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.import_payments_with_ledger\(jsonb\) FROM PUBLIC/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.import_payments_with_ledger\(jsonb\) TO authenticated/i);
  });
});
