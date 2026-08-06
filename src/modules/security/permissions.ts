/**
 * RBAC definition layer. Roles live in the `user_roles` table (never on profiles) and are
 * resolved server-side by the `has_role` security-definer function; this module maps those
 * roles onto UI capabilities so routes and buttons stay consistent with database policy.
 */

export type AppRole =
  | "superuser"
  | "admin"
  | "claims_officer"
  | "accounts_officer"
  | "data_entry_officer"
  | "auditor"
  | "viewer";

export type Permission =
  | "claims.read" | "claims.write"
  | "payments.read" | "payments.write"
  | "preauth.read" | "preauth.write" | "preauth.approve"
  | "masterdata.write"
  | "reports.read"
  | "analytics.read"
  | "ledger.read" | "ledger.write"
  | "users.manage"
  | "audit.read"
  | "settings.manage";

const ALL: Permission[] = [
  "claims.read", "claims.write", "payments.read", "payments.write",
  "preauth.read", "preauth.write", "preauth.approve", "masterdata.write",
  "reports.read", "analytics.read", "ledger.read", "ledger.write",
  "users.manage", "audit.read", "settings.manage",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  superuser: "Superuser",
  admin: "Administrator",
  claims_officer: "Claims Manager / Officer",
  accounts_officer: "Finance Officer",
  data_entry_officer: "Data Entry Officer",
  auditor: "Auditor",
  viewer: "Viewer",
};

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  superuser: ALL,
  admin: ALL,
  claims_officer: ["claims.read", "claims.write", "payments.read", "preauth.read", "preauth.write", "preauth.approve", "masterdata.write", "reports.read", "analytics.read"],
  accounts_officer: ["claims.read", "payments.read", "payments.write", "ledger.read", "ledger.write", "reports.read", "analytics.read"],
  data_entry_officer: ["claims.read", "claims.write", "preauth.read", "preauth.write", "masterdata.write"],
  auditor: ["claims.read", "payments.read", "preauth.read", "reports.read", "analytics.read", "ledger.read", "audit.read"],
  viewer: ["claims.read", "payments.read", "preauth.read", "reports.read", "analytics.read"],
};

export function permissionsFor(roles: AppRole[] = []): Set<Permission> {
  const set = new Set<Permission>();
  roles.forEach((r) => (ROLE_PERMISSIONS[r] ?? []).forEach((p) => set.add(p)));
  return set;
}

export function hasPermission(roles: AppRole[] = [], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}
