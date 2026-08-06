import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission, permissionsFor, ROLE_LABELS, type AppRole, type Permission } from "./permissions";

/**
 * UI-side permission gate. The database remains the source of truth (RLS + has_role);
 * this only hides actions the current role cannot perform.
 */
export function usePermissions() {
  const { userRole, roleLoading } = useAuth();
  const roles = useMemo<AppRole[]>(() => (userRole ? [userRole as AppRole] : []), [userRole]);

  return useMemo(
    () => ({
      roles,
      roleLabel: roles[0] ? ROLE_LABELS[roles[0]] ?? roles[0] : null,
      loading: roleLoading,
      permissions: permissionsFor(roles),
      can: (permission: Permission) => hasPermission(roles, permission),
    }),
    [roles, roleLoading],
  );
}
