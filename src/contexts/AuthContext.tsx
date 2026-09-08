import { createContext, useEffect, useState, ReactNode } from "react";
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
function createOfflineUser(): User { return { id: OFFLINE_USER_ID, aud: "authenticated", role: "authenticated", email: OFFLINE_USER_EMAIL, email_confirmed_at: new Date(0).toISOString(), phone: "", confirmed_at: new Date(0).toISOString(), last_sign_in_at: new Date().toISOString(), app_metadata: { provider: "offline", providers: ["offline"] }, user_metadata: { full_name: "CareFlow Offline Officer" }, identities: [], created_at: new Date(0).toISOString(), updated_at: new Date().toISOString(), is_anonymous: false } as User; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = useCareFlowDataMode();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (isOfflineMode()) {
      const offlineUser = createOfflineUser();
      setUser(offlineUser); setSession(null); setUserRole("admin"); setProfile({ full_name: "CareFlow Offline Officer", email: OFFLINE_USER_EMAIL }); setRoleLoading(false); setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession); setUser(nextSession?.user ?? null); setLoading(false);
      if (nextSession?.user) { void fetchUserRole(nextSession.user.id); void fetchProfile(nextSession.user.id); }
      else { setUserRole(null); setProfile(null); setRoleLoading(false); }
    });
    void supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (cancelled) return;
      setSession(nextSession); setUser(nextSession?.user ?? null); setLoading(false);
      if (nextSession?.user) { void fetchUserRole(nextSession.user.id); void fetchProfile(nextSession.user.id); } else { setRoleLoading(false); }
    }).catch(() => { if (!cancelled) { setUser(null); setSession(null); setUserRole(null); setProfile(null); setRoleLoading(false); setLoading(false); } });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [mode]);

  const fetchUserRole = async (userId: string) => {
    setRoleLoading(true);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle();
    setUserRole(data?.role ?? "viewer"); setRoleLoading(false);
  };
  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    setProfile(data ?? null);
  };
  const signOut = async () => { if (isOfflineMode()) { setUser(null); return; } await supabase.auth.signOut(); };

  return <AuthContext.Provider value={{ user, session, loading, userRole, roleLoading, profile, signOut }}>{children}</AuthContext.Provider>;
}
