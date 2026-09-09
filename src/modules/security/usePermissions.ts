import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { hasPermission, permissionsFor, ROLE_LABELS, type AppRole, type Permission } from "./permissions";

export function usePermissions() {
  const { userRole, roleLoading } = useAuth();
  const roles = useMemo<AppRole[]>(() => (userRole ? [userRole as AppRole] : []), [userRole]);
  const [serverPermissions, setServerPermissions] = useState<Set<Permission> | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!userRole || getCareFlowDataMode() === "offline") {
      setServerPermissions(null);
      setPermissionLoading(false);
      return () => { active = false; };
    }
    setPermissionLoading(true);
    void (async () => {
      const { data, error } = await (supabase.rpc as any)("get_my_permissions");
      if (!active) return;
      const effective = Array.isArray(data)
        ? data.map((row: { permission_key?: string }) => row.permission_key).filter(Boolean) as Permission[]
        : [];
      // A successful RPC is authoritative, including an intentionally empty permission set.
      // Fall back to role defaults only when the server lookup itself fails.
      setServerPermissions(error ? null : new Set(effective));
      setPermissionLoading(false);
    })();
    return () => { active = false; };
  }, [userRole]);

  const fallback = useMemo(() => permissionsFor(roles), [roles]);
  const permissions = serverPermissions ?? fallback;
  const loading = roleLoading || permissionLoading;
  return useMemo(() => ({
    roles,
    roleLabel: roles[0] ? ROLE_LABELS[roles[0]] ?? roles[0] : null,
    loading,
    permissions,
    can: (permission: Permission) => permissions.has(permission),
    hasRolePermission: (permission: Permission) => hasPermission(roles, permission),
  }), [roles, loading, permissions]);
}
