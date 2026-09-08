import { useEffect, useMemo, useState } from "react";
import { Search, Shield, UserPlus, Trash2, KeyRound, Lock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PERMISSION_CATALOG, ROLE_LABELS, ROLE_PERMISSIONS, type AppRole, type Permission } from "@/modules/security/permissions";

const roleColors: Record<string, string> = { superuser: "bg-destructive/10 text-destructive border-destructive/20", admin: "bg-primary/10 text-primary border-primary/20", claims_officer: "bg-info/10 text-info border-info/20", accounts_officer: "bg-success/10 text-success border-success/20", data_entry_officer: "bg-warning/10 text-warning border-warning/20", auditor: "bg-accent/10 text-accent border-accent/20", viewer: "bg-muted text-muted-foreground" };
type ManagedUser = { id: string; email: string | null; full_name: string | null; email_confirmed_at: string | null; created_at: string; last_sign_in_at: string | null };
type Override = { user_id: string; permission_key: Permission; granted: boolean };

export default function UsersPage() {
  const { userRole } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Array<{ user_id: string; role: AppRole }>>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [permissions, setPermissions] = useState(PERMISSION_CATALOG);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accessOpen, setAccessOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("viewer");
  const [selectedAccess, setSelectedAccess] = useState<Record<Permission, boolean>>({} as Record<Permission, boolean>);
  const [savingAccess, setSavingAccess] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", password: "", role: "viewer" as AppRole });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ user_id: "", new_password: "" });
  const isSuperuser = userRole === "superuser";
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.user_id, r.role])), [roles]);
  const categories = useMemo(() => Array.from(new Set(permissions.map((p) => p.category))), [permissions]);

  const invokeAdmin = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-user-action", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as Record<string, any>;
  };
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await invokeAdmin({ action: "list_users" });
      const profileMap = new Map((data.profiles ?? []).map((p: any) => [p.id, p]));
      setUsers((data.users ?? []).map((u: any) => ({ ...u, full_name: profileMap.get(u.id)?.full_name ?? u.full_name, email: profileMap.get(u.id)?.email ?? u.email })));
      setRoles(data.roles ?? []); setOverrides(data.overrides ?? []);
      if (Array.isArray(data.permissions) && data.permissions.length) setPermissions(data.permissions);
    } catch (err: any) { toast({ title: "Unable to load users", description: err.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isSuperuser) void loadUsers(); else setLoading(false); }, [isSuperuser]);

  const openAccess = (profile: ManagedUser) => {
    const role = roleMap.get(profile.id) ?? "viewer";
    const userOverrides = new Map(overrides.filter((o) => o.user_id === profile.id).map((o) => [o.permission_key, o.granted]));
    const next = {} as Record<Permission, boolean>;
    permissions.forEach((p) => { next[p.key] = userOverrides.has(p.key) ? Boolean(userOverrides.get(p.key)) : ROLE_PERMISSIONS[role].includes(p.key); });
    setSelectedUser(profile); setSelectedRole(role); setSelectedAccess(next); setAccessOpen(true);
  };
  const saveAccess = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedUser) return; setSavingAccess(true);
    try {
      const defaults = new Set(ROLE_PERMISSIONS[selectedRole]);
      const changes = permissions.filter((p) => selectedAccess[p.key] !== defaults.has(p.key)).map((p) => ({ permission_key: p.key, granted: selectedAccess[p.key] }));
      await invokeAdmin({ action: "update_access", target_user_id: selectedUser.id, role: selectedRole, overrides: changes });
      toast({ title: "Access updated" }); setAccessOpen(false); await loadUsers();
    } catch (err: any) { toast({ title: "Unable to update access", description: err.message, variant: "destructive" }); }
    finally { setSavingAccess(false); }
  };
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setInviteLoading(true);
    try { await invokeAdmin({ action: "create_user", email: inviteForm.email, full_name: inviteForm.full_name, password: inviteForm.password, role: inviteForm.role }); toast({ title: "User created", description: "The account is active and ready for sign-in." }); setInviteOpen(false); setInviteForm({ email: "", full_name: "", password: "", role: "viewer" }); await loadUsers(); }
    catch (err: any) { toast({ title: "Unable to create user", description: err.message, variant: "destructive" }); }
    finally { setInviteLoading(false); }
  };
  const resetPassword = async (profile: ManagedUser) => {
    if (!profile.email || !confirm(`Send a password reset email to ${profile.email}?`)) return;
    try { await invokeAdmin({ action: "reset_password", email: profile.email }); toast({ title: "Reset request processed" }); }
    catch (err: any) { toast({ title: "Unable to reset password", description: err.message, variant: "destructive" }); }
  };
  const deleteUser = async (profile: ManagedUser) => {
    const current = (await supabase.auth.getUser()).data.user?.id;
    if (profile.id === current) { toast({ title: "Action blocked", description: "You cannot delete your own account here.", variant: "destructive" }); return; }
    if (!confirm(`Permanently delete user "${profile.full_name || profile.email}"? This cannot be undone.`)) return;
    try { await invokeAdmin({ action: "delete_user", target_user_id: profile.id }); toast({ title: "User deleted" }); await loadUsers(); }
    catch (err: any) { toast({ title: "Unable to delete user", description: err.message, variant: "destructive" }); }
  };
  const setPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await invokeAdmin({ action: "set_password", target_user_id: pwForm.user_id, new_password: pwForm.new_password }); toast({ title: "Password updated" }); setPwOpen(false); setPwForm({ user_id: "", new_password: "" }); }
    catch (err: any) { toast({ title: "Unable to update password", description: err.message, variant: "destructive" }); }
  };
  const filtered = users.filter((p) => `${p.full_name ?? ""} ${p.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  if (!isSuperuser) return <div className="stat-card py-12 text-center text-muted-foreground">You do not have permission to manage user accounts.</div>;

  return <div className="space-y-6">
    <div className="page-header flex items-start justify-between"><div><h1 className="page-title">User Management</h1><p className="page-description">Create accounts and allocate roles and granular privileges.</p></div><Button onClick={() => setInviteOpen(true)} className="gap-2"><UserPlus className="w-4 h-4" />Add User</Button></div>
    <div className="stat-card"><div className="flex items-center gap-3 mb-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search users..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {loading ? <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No users found.</p> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((p) => { const role = roleMap.get(p.id) ?? "viewer"; return <tr key={p.id} className="hover:bg-muted/50 transition-colors"><td className="font-medium"><span className="inline-flex items-center gap-2"><Shield className="w-4 h-4 text-muted-foreground" />{p.full_name || "Unknown"}</span></td><td className="text-muted-foreground">{p.email || "—"}</td><td><Badge variant="outline" className={roleColors[role] || ""}>{ROLE_LABELS[role] || role}</Badge></td><td><Badge variant="outline">{p.email_confirmed_at ? "Active" : "Unverified"}</Badge></td><td><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => openAccess(p)} className="gap-1"><Settings2 className="w-4 h-4" />Access</Button><button title="Send reset email" onClick={() => resetPassword(p)} className="p-1.5 rounded hover:bg-muted"><KeyRound className="w-4 h-4 text-muted-foreground" /></button><button title="Set new password" onClick={() => { setPwForm({ user_id: p.id, new_password: "" }); setPwOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Lock className="w-4 h-4 text-muted-foreground" /></button><button title="Delete user" onClick={() => deleteUser(p)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button></div></td></tr>; })}</tbody></table></div>}
    </div>
    <EntityDialog open={accessOpen} onOpenChange={setAccessOpen} title="Role & Privileges"><form onSubmit={saveAccess} className="space-y-5 max-h-[75vh] overflow-y-auto pr-1"><p className="text-sm text-muted-foreground">Configure <strong>{selectedUser?.full_name || selectedUser?.email}</strong>. Overrides are saved separately from the role defaults.</p><div><Label>Role</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedRole} onChange={(e) => { const role = e.target.value as AppRole; setSelectedRole(role); const next = { ...selectedAccess }; permissions.forEach((p) => { next[p.key] = ROLE_PERMISSIONS[role].includes(p.key); }); setSelectedAccess(next); }}>{Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>{categories.map((category) => <div key={category} className="rounded-lg border p-3 space-y-2"><h3 className="font-medium text-sm">{category}</h3>{permissions.filter((p) => p.category === category).map((p) => <label key={p.key} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"><input type="checkbox" className="mt-1" checked={Boolean(selectedAccess[p.key])} onChange={(e) => setSelectedAccess((prev) => ({ ...prev, [p.key]: e.target.checked }))} /><span><span className="block text-sm font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.description}</span></span></label>)}</div>)}<Button type="submit" className="w-full" disabled={savingAccess}>{savingAccess ? "Saving access..." : "Save Role & Privileges"}</Button></form></EntityDialog>
    <EntityDialog open={inviteOpen} onOpenChange={setInviteOpen} title="Create User Account"><form onSubmit={createUser} className="space-y-4"><div><Label>Full Name *</Label><Input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required className="mt-1" /></div><div><Label>Email *</Label><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required className="mt-1" /></div><div><Label>Temporary Password *</Label><Input type="password" minLength={12} value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} required className="mt-1" /><p className="text-xs text-muted-foreground mt-1">Use at least 12 characters.</p></div><div><Label>Role</Label><select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as AppRole })}>{Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div><Button type="submit" className="w-full" disabled={inviteLoading}>{inviteLoading ? "Creating..." : "Create User"}</Button></form></EntityDialog>
    <EntityDialog open={pwOpen} onOpenChange={setPwOpen} title="Set New Password"><form onSubmit={setPassword} className="space-y-4"><div><Label>New Password</Label><Input type="password" minLength={12} value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required className="mt-1" /></div><p className="text-xs text-muted-foreground">At least 12 characters. The password changes immediately.</p><Button type="submit" className="w-full">Update Password</Button></form></EntityDialog>
  </div>;
}
