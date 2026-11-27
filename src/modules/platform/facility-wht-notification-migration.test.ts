import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261127170000_facility_wht_and_audit_notifications.sql"),
  "utf8",
);

describe("facility WHT and audit notification release contract", () => {
  it("exposes WHT-rate configuration only through a superuser-only wrapper", () => {
    expect(migration).toContain("Only a superuser can configure facility WHT rates");
    expect(migration).toContain("REVOKE ALL ON FUNCTION security_internal.set_facility_provisional_wht_rate(uuid, numeric) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.set_facility_provisional_wht_rate(uuid, numeric) TO authenticated");
  });

  it("fans out safe notification metadata from immutable audit events", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.notify_from_audit_log()");
    expect(migration).toContain("AFTER INSERT ON public.audit_logs");
    expect(migration).toContain("public.facility_memberships fm");
    expect(migration).toContain("fm.status = 'active'");
    expect(migration).toContain("source_audit_log_id");
    expect(migration).toContain("ON CONFLICT (user_id, source_audit_log_id)");
    expect(migration).not.toContain("NEW.new_data, NEW.old_data, NEW.changed_by");
  });

  it("stores navigation and idempotency metadata without copying source-row payloads", () => {
    expect(migration).toContain("action_url");
    expect(migration).toContain("entity_type");
    expect(migration).toContain("entity_id");
    expect(migration).toContain("jsonb_build_object('audit_action', NEW.action, 'audit_log_id', NEW.id)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.notify_from_audit_log() FROM PUBLIC, anon, authenticated");
  });
});
