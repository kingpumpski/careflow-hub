import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123113000_separate_provisional_actual_wht_reporting.sql'),
  'utf8',
);

describe('provisional and actual WHT reporting migration contract', () => {
  it('keeps provisional and actual tax in separate output columns', () => {
    expect(migration).toMatch(/provisional_withholding_tax_amount/i);
    expect(migration).toMatch(/actual_withholding_tax_amount/i);
    expect(migration).toMatch(/actual_withholding_tax_entry_count/i);
  });

  it('uses only confirmed actual WHT after insurer payment advice', () => {
    expect(migration).toMatch(/settlement_status IN \('payment_advice_received', 'reconciled'\)/i);
    expect(migration).toMatch(/WHEN COALESCE\(st\.actual_withholding_tax_entry_count, 0\) > 0/i);
    expect(migration).toMatch(/WHEN COALESCE\(st\.settlement_period_count, 0\) > 0[\s\S]*?THEN COALESCE\(st\.provisional_withholding_tax_amount, 0::numeric\)/i);
  });

  it('uses monthly settlement advice as the preferred source for monthly claims reporting', () => {
    expect(migration).toMatch(/FROM public\.claims_settlement_periods s/i);
    expect(migration).toMatch(/s\.period_type = 'month'/i);
    expect(migration).toMatch(/security_invoker = true/i);
  });

  it('keeps rejection events separate from submitted claim totals', () => {
    expect(migration).toMatch(/lower\(COALESCE\(c\.status, ''::text\)\) <> 'rejected'/i);
    expect(migration).toMatch(/AS rejected_amount/i);
  });
});
