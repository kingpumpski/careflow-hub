import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { hasPermission, permissionsFor, PERMISSION_CATALOG, ROLE_LABELS, type AppRole, type Permission } from "./permissions";

const SYSTEM_ADMIN_ROLES = new Set<AppRole>(["superuser", "admin"]);
const ALL_PERMISSIONS = new Set<Permission>(PERMISSION_CATALOG.map((permission) => permission.key));
type PermissionRpcRow = { permission_key?: string };
type PermissionRpcResult = { data: PermissionRpcRow[] | null; error: unknown };

async function fetchMyPermissions(): Promise<PermissionRpcResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (functionName: "get_my_permissions") => Promise<PermissionRpcResult>;
  return rpc("get_my_permissions");
}

export function usePermissions() {
  const { userRole, roleLoading } = useAuth();
  const roles = useMemo<AppRole[]>(() => (userRole ? [userRole as AppRole] : []), [userRole]);
  const isSystemAdministrator = roles.some((role) => SYSTEM_ADMIN_ROLES.has(role));
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
      const { data, error } = await fetchMyPermissions();
      if (!active) return;
      const effective = Array.isArray(data)
        ? data.map((row) => row.permission_key).filter((key): key is Permission => Boolean(key))
        : [];
      // A successful RPC is authoritative for ordinary users. System administrators
      // retain full control by role, independent of permission overrides or tenancy.
      setServerPermissions(error ? null : new Set(effective));
      setPermissionLoading(false);
    })();
    return () => { active = false; };
  }, [userRole]);

  const fallback = useMemo(() => permissionsFor(roles), [roles]);
  const permissions = isSystemAdministrator ? ALL_PERMISSIONS : (serverPermissions ?? fallback);
  const loading = roleLoading || permissionLoading;
  return useMemo(() => ({
    roles,
    roleLabel: roles[0] ? ROLE_LABELS[roles[0]] ?? roles[0] : null,
    loading,
    isSystemAdministrator,
    permissions,
    can: (permission: Permission) => isSystemAdministrator || permissions.has(permission),
    hasRolePermission: (permission: Permission) => isSystemAdministrator || hasPermission(roles, permission),
  }), [roles, loading, isSystemAdministrator, permissions]);
}
