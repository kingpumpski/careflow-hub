import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261122211659_harden_remaining_security_definer_search_paths.sql"),
  "utf8",
);

describe("legacy SECURITY DEFINER search-path hardening", () => {
  it("pins all remaining public security helpers to an empty search_path", () => {
    for (const name of ["audit_trigger_fn", "handle_new_user", "has_role"]) {
      expect(migration).toMatch(
        new RegExp(`FUNCTION public\\.${name}\\([\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`, "i"),
      );
    }
  });

  it("retains schema-qualified data access and trigger behavior", () => {
    expect(migration).toContain("INSERT INTO public.audit_logs");
    expect(migration).toContain("INSERT INTO public.profiles");
    expect(migration).toContain("INSERT INTO public.user_roles");
    expect(migration).toContain("FROM public.user_roles");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("RETURN NEW");
    expect(migration).toContain("RETURN OLD");
  });
});
