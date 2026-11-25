import type { Permission } from "@/modules/security";

type PermissionCheck = (permission: Permission) => boolean;

export function hasSettlementExceptionReadAccess(can: PermissionCheck): boolean {
  return can("payments.read") || can("claims.settlement.read");
}

export function hasSettlementExceptionWriteAccess(can: PermissionCheck): boolean {
  return can("payments.write") || can("claims.settlement.write");
}
