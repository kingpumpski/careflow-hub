import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isOfflineMode, useCareFlowDataMode } from "@/modules/offline/data-mode";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  roleLoading: boolean;
  profile: { full_name: string; email: string } | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, session: null, loading: true, userRole: null, roleLoading: true, profile: null, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);
const OFFLINE_USER_ID = "offline-careflow-user";
const OFFLINE_USER_EMAIL = "offline@careflow.local";
const ROLE_PRIORITY: Record<string, number> = { superuser: 100, admin: 90, claims_officer: 70, accounts_officer: 60, data_entry_officer: 50, auditor: 40, viewer: 10 };
const ROLE_CHECK_ROLES = Object.entries(ROLE_PRIORITY).sort(([, a], [, b]) => b - a).map(([role]) => role);
type RoleCheckResult = { data: boolean | null; error: unknown };

function createOfflineUser(): User { return { id: OFFLINE_USER_ID, aud: "authenticated", role: "authenticated", email: OFFLINE_USER_EMAIL, email_confirmed_at: new Date(0).toISOString(), phone: "", confirmed_at: new Date(0).toISOString(), last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "offline", providers: ["offline"] }, user_metadata: { full_name: "CareFlow Offline Officer" }, identities: [], created_at: new Date(0).toISOString(), updated_at: new Date().toISOString(), is_anonymous: false } as User; }
function highestRole(roles: string[]): string | null { return roles.filter(Boolean).sort((a, b) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0))[0] ?? null; }
async function checkRole(role: string): Promise<RoleCheckResult> { const rpc = supabase.rpc.bind(supabase) as unknown as (functionName: "current_user_has_any_role", args: { p_roles: string[] }) => Promise<RoleCheckResult>; return rpc("current_user_has_any_role", { p_roles: [role] }); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = useCareFlowDataMode();
  const [user, setUser] = useState<User | null>(null); const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true); const [userRole, setUserRole] = useState<string | null>(null); const [roleLoading, setRoleLoading] = useState(true); const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null);

  const fetchUserRole = useCallback(async (userId: string) => {
    setRoleLoading(true);
    try {
      const { data: roleRows, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!roleError) { const resolved = highestRole((roleRows ?? []).map((row) => String(row.role))); setUserRole(resolved); if (resolved) return; }
      for (const role of ROLE_CHECK_ROLES) { const { data, error } = await checkRole(role); if (error) break; if (data === true) { setUserRole(role); return; } }
      setUserRole(null);
    } catch (error) { console.error("Unable to resolve CareFlow user role", error); setUserRole(null); }
    finally { setRoleLoading(false); }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => { const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(); setProfile(data ?? null); }, []);

  useEffect(() => {
    let cancelled = false;
    if (isOfflineMode()) { const offlineUser = createOfflineUser(); setUser(offlineUser); setSession(null); setUserRole("admin"); setProfile({ full_name: "CareFlow Offline Officer", email: OFFLINE_USER_EMAIL }); setRoleLoading(false); setLoading(false); return () => { cancelled = true; }; }
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (cancelled) return; setSession(nextSession); setUser(nextSession?.user ?? null); setLoading(false); if (nextSession?.user) { void fetchUserRole(nextSession.user.id); void fetchProfile(nextSession.user.id); } else { setUserRole(null); setProfile(null); setRoleLoading(false); } });
    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => { if (cancelled) return; setSession(nextSession); setUser(nextSession?.user ?? null); setLoading(false); if (nextSession?.user) { void fetchUserRole(nextSession.user.id); void fetchProfile(nextSession.user.id); } else setRoleLoading(false); }).catch(() => { if (!cancelled) { setUser(null); setSession(null); setUserRole(null); setProfile(null); setRoleLoading(false); setLoading(false); } });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [fetchProfile, fetchUserRole, mode]);

  const signOut = async () => { if (isOfflineMode()) { setUser(null); return; } await supabase.auth.signOut(); };
  return <AuthContext.Provider value={{ user, session, loading, userRole, roleLoading, profile, signOut }}>{children}</AuthContext.Provider>;
}
