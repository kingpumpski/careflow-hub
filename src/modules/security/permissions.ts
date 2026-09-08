/**
 * RBAC definition and permission catalog.
 * Role defaults are mirrored in Supabase; per-user overrides are resolved server-side.
 */
export type AppRole = "superuser" | "admin" | "claims_officer" | "accounts_officer" | "data_entry_officer" | "auditor" | "viewer";
export type Permission = "claims.read" | "claims.write" | "payments.read" | "payments.write" | "preauth.read" | "preauth.write" | "preauth.approve" | "masterdata.write" | "reports.read" | "analytics.read" | "ledger.read" | "ledger.write" | "users.manage" | "audit.read" | "settings.manage";
export type PermissionDefinition = { key: Permission; label: string; category: string; description: string };

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: "claims.read", label: "View claims", category: "Claims", description: "View claims and claim records." },
  { key: "claims.write", label: "Manage claims", category: "Claims", description: "Create and update claim records." },
  { key: "payments.read", label: "View payments", category: "Payments", description: "View payment and settlement information." },
  { key: "payments.write", label: "Manage payments", category: "Payments", description: "Create and update payment records." },
  { key: "preauth.read", label: "View pre-authorizations", category: "Pre-Authorization", description: "View pre-authorization requests." },
  { key: "preauth.write", label: "Prepare pre-authorizations", category: "Pre-Authorization", description: "Create, edit and prepare authorization request packages." },
  { key: "preauth.approve", label: "Approve pre-authorizations", category: "Pre-Authorization", description: "Approve pre-authorization workflow actions where applicable." },
  { key: "masterdata.write", label: "Manage master data", category: "Administration", description: "Create and update operational master data." },
  { key: "reports.read", label: "View reports", category: "Reporting", description: "View operational and financial reports." },
  { key: "analytics.read", label: "View analytics", category: "Reporting", description: "View analytics and dashboards." },
  { key: "ledger.read", label: "View ledger", category: "Finance", description: "View ledger information." },
  { key: "ledger.write", label: "Manage ledger", category: "Finance", description: "Create and update ledger information." },
  { key: "users.manage", label: "Manage users", category: "Administration", description: "Manage user accounts, roles and privileges." },
  { key: "audit.read", label: "View audit records", category: "Administration", description: "View audit and security records." },
  { key: "settings.manage", label: "Manage settings", category: "Administration", description: "Manage system configuration and settings." },
];
const ALL: Permission[] = PERMISSION_CATALOG.map((p) => p.key);
export const ROLE_LABELS: Record<AppRole, string> = { superuser: "Superuser", admin: "Administrator", claims_officer: "Claims Manager / Officer", accounts_officer: "Finance Officer", data_entry_officer: "Data Entry Officer", auditor: "Auditor", viewer: "Viewer" };
export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  superuser: ALL, admin: ALL,
  claims_officer: ["claims.read", "claims.write", "payments.read", "preauth.read", "preauth.write", "preauth.approve", "masterdata.write", "reports.read", "analytics.read"],
  accounts_officer: ["claims.read", "payments.read", "payments.write", "ledger.read", "ledger.write", "reports.read", "analytics.read"],
  data_entry_officer: ["claims.read", "claims.write", "preauth.read", "preauth.write", "masterdata.write"],
  auditor: ["claims.read", "payments.read", "preauth.read", "reports.read", "analytics.read", "ledger.read", "audit.read"],
  viewer: ["claims.read", "payments.read", "preauth.read", "reports.read", "analytics.read"],
};
export function permissionsFor(roles: AppRole[] = []): Set<Permission> { const set = new Set<Permission>(); roles.forEach((r) => (ROLE_PERMISSIONS[r] ?? []).forEach((p) => set.add(p))); return set; }
export function applyPermissionOverrides(base: Set<Permission>, overrides: Array<{ permission_key: Permission; granted: boolean }>): Set<Permission> { const effective = new Set(base); overrides.forEach(({ permission_key, granted }) => granted ? effective.add(permission_key) : effective.delete(permission_key)); return effective; }
export function hasPermission(roles: AppRole[] = [], permission: Permission): boolean { return permissionsFor(roles).has(permission); }
