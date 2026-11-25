import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261120160000_settlement_exception_atomic_lifecycle.sql"),
  "utf8",
);

describe("online settlement exception migration contract", () => {
  it("requires an authenticated user with payment-write permission and facility access", () => {
    expect(migration).toContain("auth.uid() IS NULL");
    expect(migration).toContain("security_internal.current_user_has_permission('payments.write')");
    expect(migration).toContain("security_internal.current_user_has_permission('claims.settlement.write')");
    expect(migration).toContain("security_internal.user_has_facility_access(v_facility_id)");
    expect(migration).toContain("security_internal.user_has_facility_access(v_exception.facility_id)");
  });

  it("locks settlement periods and exception rows before making lifecycle decisions", () => {
    expect(migration).toMatch(/FROM public\.claims_settlement_periods[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/FROM public\.settlement_exceptions[\s\S]*?FOR UPDATE/i);
  });

  it("writes creation and transition audit events in the same SQL transaction", () => {
    expect(migration).toContain("INSERT INTO public.settlement_exception_audit_events");
    expect(migration).toContain("'created'");
    expect(migration).toContain("'status_changed'");
    expect(migration).toContain("'detection_refreshed'");
    expect(migration).toContain("before_details");
    expect(migration).toContain("after_details");
    expect(migration).toContain("before_status");
    expect(migration).toContain("after_status");
  });

  it("requires notes and enforces only supported status transitions", () => {
    expect(migration).toContain("SETTLEMENT_EXCEPTION_NOTE_REQUIRED");
    expect(migration).toContain("v_note IS NULL");
    expect(migration).toContain("v_exception.status = 'open' AND p_target_status IN ('under_review','waived')");
    expect(migration).toContain("v_exception.status = 'under_review' AND p_target_status IN ('resolved','waived')");
  });

  it("prevents direct authenticated writes and limits RPC execution to authenticated users", () => {
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*?ON TABLE public\.settlement_exceptions FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*?ON TABLE public\.settlement_exception_audit_events FROM PUBLIC, anon, authenticated/i);
    expect(migration).toContain("GRANT SELECT ON TABLE public.settlement_exceptions TO authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.settlement_exception_audit_events TO authenticated");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
  });

  it("keeps exposed RPC wrappers invoker-only and private mutation helpers definer-only", () => {
    const helpers = migration.split("CREATE OR REPLACE FUNCTION security_internal.").slice(1);
    const wrappers = migration.split("CREATE OR REPLACE FUNCTION public.").slice(1);
    expect(helpers).toHaveLength(2);
    expect(wrappers).toHaveLength(2);
    for (const definition of helpers) {
      expect(definition).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    }
    for (const definition of wrappers) {
      expect(definition).toMatch(/SECURITY INVOKER[\s\S]*?SET search_path = ''/i);
    }
    expect(migration).not.toContain("p_detected_at");
  });
});
