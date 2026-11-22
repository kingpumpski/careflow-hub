import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261121160000_atomic_monthly_claim_submission.sql"),
  "utf8",
);

describe("monthly claim migration SQL delimiters", () => {
  it("uses paired dollar-quote delimiters for every function body", () => {
    expect(migration).not.toMatch(/^\s*AS\s+\$(?:\s|$)/m);

    const delimiters = migration.match(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g) ?? [];
    const counts = new Map<string, number>();
    for (const delimiter of delimiters) {
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }

    for (const [delimiter, count] of counts) {
      expect(count, `unpaired SQL dollar delimiter ${delimiter}`).toBeGreaterThan(0);
      expect(count % 2, `unbalanced SQL dollar delimiter ${delimiter}`).toBe(0);
    }
  });

  it("declares both transactional posting helpers with complete bodies", () => {
    expect(migration).toMatch(/FUNCTION security_internal\.submit_monthly_claim_atomic[\s\S]*?AS \$\$/);
    expect(migration).toMatch(/FUNCTION security_internal\.submit_claim_rejection_atomic[\s\S]*?AS \$\$/);
  });
});

  
describe("monthly claim migration financial aggregation", () => {
  it("prevents negative WHT reversal totals from creating phantom outstanding balances", () => {
    expect(migration).toMatch(
      /greatest\s*\(\s*sum\s*\(\s*coalesce\s*\(\s*t\.tax_amount/i,
    );
    expect(migration).toMatch(/WITH \(security_invoker = true\)/i);
  });
});
