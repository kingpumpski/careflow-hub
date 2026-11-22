import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAIM_STATUSES, getAvailableClaimTransitions } from "./lifecycle";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261120170000_individual_claim_case_lifecycle.sql"),
  "utf8",
);

describe("individual claim case migration contract", () => {
  it("keeps monthly aggregate claims separate from facility-scoped individual cases", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.claim_cases");
    expect(migration).toContain("facility_id uuid NOT NULL REFERENCES public.facilities(id)");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.claim_case_events");
    expect(migration).toContain("public.claims");
    expect(migration).toContain("which remains the insurer-level monthly aggregate ledger");
  });

  it("enables facility-scoped RLS and denies direct authenticated writes", () => {
    expect(migration).toMatch(/ALTER TABLE public\.claim_cases ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.claim_case_events ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toContain("security_internal.user_has_facility_access(facility_id)");
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.claim_cases FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.claim_cases, public\.claim_case_events TO authenticated/i);
  });

  it("keeps all SQL lifecycle transitions aligned with the domain catalogue", () => {
    const helper = migration.match(/FUNCTION security_internal\.claim_case_transition_allowed[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/i)?.[1];
    expect(helper).toBeTruthy();
    const sqlTransitions = new Map<string, string[]>();
    for (const match of helper!.matchAll(/WHEN '([^']+)' THEN (.+)$/gm)) {
      const [, from, expression] = match;
      const single = expression.match(/^p_to_status = '([^']+)'/);
      const list = expression.match(/^p_to_status IN \((.+)\)/);
      const allowed = single ? [single[1]] : list ? Array.from(list[1].matchAll(/'([^']+)'/g), (entry) => entry[1]) : [];
      sqlTransitions.set(from, allowed);
    }
    expect([...sqlTransitions.keys()].sort()).toEqual([...CLAIM_STATUSES].sort());
    for (const status of CLAIM_STATUSES) {
      expect(sqlTransitions.get(status)).toEqual([...getAvailableClaimTransitions(status)]);
    }
  });

  it("rejects non-finite and over-precision submitted amounts in the database RPC", () => {
    expect(migration).toContain("p_submitted_amount::text IN ('NaN', 'Infinity', '-Infinity')");
    expect(migration).toContain("p_submitted_amount <> round(p_submitted_amount, 2)");
    expect(migration).toContain("Submitted amount must be finite, positive and have no more than two decimal places");
  });

  it("only changes approved and paid amounts at their matching lifecycle stages", () => {
    expect(migration).toContain("v_approved := v_case.approved_amount;");
    expect(migration).toContain("v_paid := v_case.paid_amount;");
    expect(migration).toMatch(/IF p_target_status IN \('approved', 'partially_approved'\) THEN[\s\S]*?v_approved := coalesce\(p_approved_amount, v_case\.approved_amount\);/);
    expect(migration).toMatch(/IF p_target_status IN \('partially_paid', 'paid'\) THEN[\s\S]*?v_paid := coalesce\(p_paid_amount, v_case\.paid_amount\);/);
    expect(migration).toContain("IF v_paid < v_case.paid_amount THEN");
    expect(migration).toContain("Cumulative paid amount cannot decrease");
  });

  it("rejects non-finite and over-precision adjudication and payment amounts", () => {
    expect(migration).toContain("p_approved_amount::text IN ('NaN', 'Infinity', '-Infinity')");
    expect(migration).toContain("p_approved_amount <> round(p_approved_amount, 2)");
    expect(migration).toContain("p_paid_amount::text IN ('NaN', 'Infinity', '-Infinity')");
    expect(migration).toContain("p_paid_amount <> round(p_paid_amount, 2)");
    expect(migration).toContain("Approved amount must be finite and have no more than two decimal places");
    expect(migration).toContain("Paid amount must be finite and have no more than two decimal places");
  });

  it("records creation and each status transition in the event table", () => {
    expect(migration).toMatch(/INSERT INTO public\.claim_case_events[\s\S]*?Individual claim case created/i);
    expect(migration).toMatch(/INSERT INTO public\.claim_case_events[\s\S]*?v_case\.status, p_target_status/i);
    expect(migration).toContain("A note is required for every lifecycle transition");
    expect(migration).toContain("FOR UPDATE");
  });

  it("keeps exposed claim-case RPCs invoker-only and mutation helpers private", () => {
    expect(migration).toMatch(/FUNCTION security_internal\.create_individual_claim_case[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/FUNCTION security_internal\.transition_individual_claim_case[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/FUNCTION public\.create_individual_claim_case[\s\S]*?SECURITY INVOKER[\s\S]*?SET search_path = ''/i);
    expect(migration).toMatch(/FUNCTION public\.transition_individual_claim_case[\s\S]*?SECURITY INVOKER[\s\S]*?SET search_path = ''/i);
  });

  it("enforces claim-write permission and facility membership before mutations", () => {
    expect(migration).toContain("security_internal.current_user_has_permission('claims.write')");
    expect(migration).toContain("security_internal.user_has_facility_access(p_facility_id)");
    expect(migration).toContain("security_internal.user_has_facility_access(v_case.facility_id)");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_individual_claim_case[\s\S]*?FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.transition_individual_claim_case[\s\S]*?FROM PUBLIC, anon, authenticated/i);
  });
});
