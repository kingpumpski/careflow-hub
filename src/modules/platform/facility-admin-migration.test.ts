import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261120173000_facility_admin_onboarding.sql"),
  "utf8",
);

describe("facility onboarding migration contract", () => {
  it("creates the first facility and assigns its creator as the first owner atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION security_internal.create_facility_with_owner");
    expect(migration).toContain("INSERT INTO public.facilities");
    expect(migration).toContain("INSERT INTO public.facility_memberships (facility_id, user_id, role, status)");
    expect(migration).toContain("v_user_id, 'owner', 'active'");
  });

  it("restricts facility administration to authenticated system administrators", () => {
    expect(migration).toContain("security_internal.current_user_has_any_role(ARRAY['superuser'::public.app_role, 'admin'::public.app_role])");
    expect(migration).toContain("security_internal.current_user_has_permission('settings.manage')");
    expect(migration).toContain("security_internal.current_user_has_permission('users.manage')");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_facility_with_owner[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/FUNCTION public\.create_facility_with_owner[\s\S]*?SECURITY INVOKER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/FUNCTION security_internal\.create_facility_with_owner[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
  });

  it("requires an existing account before granting membership and audits membership changes", () => {
    expect(migration).toContain("FROM auth.users u");
    expect(migration).toContain("No CareFlow account exists for that email");
    expect(migration).toContain("INSERT INTO public.audit_logs");
    expect(migration).toContain("status = 'suspended'");
    expect(migration).toContain("A facility must retain at least one active owner");
    expect(migration).toContain("FOR UPDATE");
  });
});
