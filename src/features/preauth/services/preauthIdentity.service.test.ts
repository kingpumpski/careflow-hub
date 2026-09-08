import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { normalizePreAuthIdentity } from "./preauthIdentity.service";

describe("preauth identity", () => {
  it("keeps client identity independent from insurer identity", () => {
    const result = normalizePreAuthIdentity(
      { patientId: null, name: "  Ama   Mensah ", dateOfBirth: "1992-04-03", membershipNumber: "OLD-123" },
      { insurerId: "insurer-a", name: "  Alpha Health  ", memberNumber: "MEM-9", planName: "Gold" },
    );
    expect(result.client_name).toBe("Ama   Mensah");
    expect(result.client_membership_number).toBe("OLD-123");
    expect(result.insurer_name).toBe("Alpha Health");
    expect(result.insurance_company_id).toBe("insurer-a");
  });

  it("allows a completely text-only client and payer", () => {
    const result = normalizePreAuthIdentity(
      { name: "New Client", phone: "0240000000" },
      { name: "New Insurance Scheme", memberNumber: "M-001" },
    );
    expect(result.patient_id).toBeNull();
    expect(result.insurance_company_id).toBeNull();
    expect(result.client_name).toBe("New Client");
    expect(result.insurer_name).toBe("New Insurance Scheme");
  });
});
