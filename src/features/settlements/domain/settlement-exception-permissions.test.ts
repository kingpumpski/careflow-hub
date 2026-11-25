import { describe, expect, it } from "vitest";
import { hasPermission } from "@/modules/security/permissions";
import { hasSettlementExceptionReadAccess, hasSettlementExceptionWriteAccess } from "./settlement-exception-permissions";

describe("settlement exception register permissions", () => {
  it("allows claims officers to use the register without broad payment permissions", () => {
    const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(["claims_officer"], permission);
    expect(can("payments.read")).toBe(false);
    expect(can("payments.write")).toBe(false);
    expect(hasSettlementExceptionReadAccess(can)).toBe(true);
    expect(hasSettlementExceptionWriteAccess(can)).toBe(true);
  });

  it("allows accounts officers through their existing payment permissions", () => {
    const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(["accounts_officer"], permission);
    expect(hasSettlementExceptionReadAccess(can)).toBe(true);
    expect(hasSettlementExceptionWriteAccess(can)).toBe(true);
  });

  it("keeps auditors and viewers read-only and denies unrelated data-entry roles", () => {
    const auditorCan = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(["auditor"], permission);
    const viewerCan = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(["viewer"], permission);
    const dataEntryCan = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(["data_entry_officer"], permission);
    expect(hasSettlementExceptionReadAccess(auditorCan)).toBe(true);
    expect(hasSettlementExceptionWriteAccess(auditorCan)).toBe(false);
    expect(hasSettlementExceptionReadAccess(viewerCan)).toBe(true);
    expect(hasSettlementExceptionWriteAccess(viewerCan)).toBe(false);
    expect(hasSettlementExceptionReadAccess(dataEntryCan)).toBe(false);
    expect(hasSettlementExceptionWriteAccess(dataEntryCan)).toBe(false);
  });
});
