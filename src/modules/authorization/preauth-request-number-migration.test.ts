import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261122211454_harden_preauth_request_number_search_path.sql"),
  "utf8",
);

describe("pre-authorization request-number trigger hardening", () => {
  it("preserves trigger behavior while pinning SECURITY DEFINER name resolution", () => {
    expect(migration).toMatch(/FUNCTION security_internal\.set_preauth_request_number\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    expect(migration).toContain("pg_catalog.btrim");
    expect(migration).toContain("pg_catalog.now()");
    expect(migration).toContain("pg_catalog.upper");
    expect(migration).toContain("pg_catalog.substr");
    expect(migration).toContain("pg_catalog.replace");
    expect(migration).toContain("'PA-'");
  });
});
