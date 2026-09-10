import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isOfflineMode, useCareFlowDataMode } from "@/modules/offline/data-mode";
import type { AppRole } from "@/modules/security/permissions";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: AppRole | null;
  roleLoading: boolean;
  profile: { full_name: string; email: string } | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  userRole: null,
  roleLoading: true,
  profile: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const OFFLINE_USER_ID = "offline-careflow-user";
const OFFLINE_USER_EMAIL = "offline@careflow.local";
const ROLE_PRIORITY: Record<AppRole, number> = {
  superuser: 100,
  admin: 90,
  claims_officer: 70,
  accounts_officer: 60,
  data_entry_officer: 50,
  auditor: 40,
  viewer: 10,
};
const ROLE_CHECK_ROLES = (Object.entries(ROLE_PRIORITY) as Array<[AppRole, number]>)
  .sort(([, a], [, b]) => b - a)
  .map(([role]) => role);
const APP_ROLES = new Set<AppRole>(Object.keys(ROLE_PRIORITY) as AppRole[]);

type RoleRow = { role: string | null };
type RoleCheckResult = { data: boolean | null; error: unknown };
type ProfileRow = { full_name: string | null; email: string | null };

function createOfflineUser(): User {
  return {
    id: OFFLINE_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: OFFLINE_USER_EMAIL,
    email_confirmed_at: new Date(0).toISOString(),
    phone: "",
    confirmed_at: new Date(0).toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "offline", providers: ["offline"] },
    user_metadata: { full_name: "CareFlow Offline Officer" },
    identities: [],
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  } as User;
}

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.has(value as AppRole);
}

function highestRole(roles: unknown[]): AppRole | null {
  return roles
    .filter(isAppRole)
    .sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a])[0] ?? null;
}

async function checkRole(role: AppRole): Promise<RoleCheckResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    functionName: "current_user_has_any_role",
    args: { p_roles: AppRole[] },
  ) => Promise<RoleCheckResult>;
  return rpc("current_user_has_any_role", { p_roles: [role] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = useCareFlowDataMode();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null);

  const fetchUserRole = useCallback(async (userId: string, isCurrent: () => boolean) => {
    setRoleLoading(true);
    try {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (!isCurrent()) return;
      if (!roleError) {
        const resolved = highestRole((roleRows ?? []).map((row: RoleRow) => row.role));
        setUserRole(resolved);
        if (resolved) return;
      }

      for (const role of ROLE_CHECK_ROLES) {
        if (!isCurrent()) return;
        const { data, error } = await checkRole(role);
        if (error) break;
        if (data === true) {
          if (isCurrent()) setUserRole(role);
          return;
        }
      }
      if (isCurrent()) setUserRole(null);
    } catch (error) {
      console.error("Unable to resolve CareFlow user role", error);
      if (isCurrent()) setUserRole(null);
    } finally {
      if (isCurrent()) setRoleLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string, isCurrent: () => boolean) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (!isCurrent()) return;
    if (error) {
      console.error("Unable to resolve CareFlow profile", error);
      setProfile(null);
      return;
    }
    const row = data as ProfileRow | null;
    setProfile(row?.full_name && row?.email ? { full_name: row.full_name, email: row.email } : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled;

    if (isOfflineMode()) {
      const offlineUser = createOfflineUser();
      setUser(offlineUser);
      setSession(null);
      setUserRole("admin");
      setProfile({ full_name: "CareFlow Offline Officer", email: OFFLINE_USER_EMAIL });
      setRoleLoading(false);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setRoleLoading(true);

    const applySession = (nextSession: Session | null) => {
      if (!isCurrent()) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (nextSession?.user) {
        void fetchUserRole(nextSession.user.id, isCurrent);
        void fetchProfile(nextSession.user.id, isCurrent);
      } else {
        setUserRole(null);
        setProfile(null);
        setRoleLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session: nextSession } }) => {
        applySession(nextSession);
      })
      .catch((error) => {
        console.error("Unable to restore CareFlow session", error);
        if (!isCurrent()) return;
        setUser(null);
        setSession(null);
        setUserRole(null);
        setProfile(null);
        setRoleLoading(false);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchUserRole, mode]);

  const signOut = async () => {
    if (isOfflineMode()) {
      setUser(null);
      setSession(null);
      setUserRole(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, roleLoading, profile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
