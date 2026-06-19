import { useState } from "react";
import { Search, Shield, UserPlus, Trash2, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EntityDialog from "@/components/shared/EntityDialog";
import { useSupabaseQuery, useSupabaseUpdate } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const roleColors: Record<string, string> = {
  superuser: "bg-destructive/10 text-destructive border-destructive/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  claims_officer: "bg-info/10 text-info border-info/20",
  accounts_officer: "bg-success/10 text-success border-success/20",
  data_entry_officer: "bg-warning/10 text-warning border-warning/20",
  auditor: "bg-accent/10 text-accent border-accent/20",
  viewer: "bg-muted text-muted-foreground",
};

const roleLabels: Record<string, string> = {
  superuser: "Superuser",
  admin: "Admin",
  claims_officer: "Claims Officer",
  accounts_officer: "Accounts Officer",
  data_entry_officer: "Data Entry Officer",
  auditor: "Auditor",
  viewer: "Viewer",
};

export default function UsersPage() {
  const { userRole } = useAuth();
  const { data: profiles, isLoading: profilesLoading } = useSupabaseQuery("profiles");
  const { data: roles, isLoading: rolesLoading } = useSupabaseQuery("user_roles");
  const updateRoleMutation = useSupabaseUpdate("user_roles");
  const [search, setSearch] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", password: "", role: "viewer" });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ user_id: "", new_password: "" });

  const isLoading = profilesLoading || rolesLoading;
  const isSuperuser = userRole === "superuser";

  const getUserRole = (userId: string) => {
    const r = (roles || []).find((r: any) => r.user_id === userId);
    return r?.role || "viewer";
  };

  const getRoleId = (userId: string) => {
    const r = (roles || []).find((r: any) => r.user_id === userId);
    return r?.id;
  };

  const openEditRole = (profile: any) => {
    setSelectedUser(profile);
    setSelectedRole(getUserRole(profile.id));
    setEditDialogOpen(true);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const roleId = getRoleId(selectedUser.id);
    if (!roleId) { toast({ title: "Error", description: "No role record found", variant: "destructive" }); return; }
    try {
      await updateRoleMutation.mutateAsync({ id: roleId, role: selectedRole });
      toast({ title: "Role updated" });
      setEditDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: inviteForm.email,
        password: inviteForm.password,
        options: { data: { full_name: inviteForm.full_name }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      // Update the role after signup - the trigger creates a default 'viewer' role
      if (data.user && inviteForm.role !== "viewer") {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (roleData) {
          await (supabase.from("user_roles") as any).update({ role: inviteForm.role }).eq("id", roleData.id);
        }
      }
      toast({ title: "User invited!", description: "They should verify their email." });
      setInviteDialogOpen(false);
      setInviteForm({ email: "", full_name: "", password: "", role: "viewer" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResetPassword = async (profile: any) => {
    if (!profile.email) { toast({ title: "No email on file", variant: "destructive" }); return; }
    if (!confirm(`Send password reset email to ${profile.email}?`)) return;
    try {
      const { error } = await supabase.functions.invoke("admin-user-action", {
        body: { action: "reset_password", email: profile.email },
      });
      if (error) throw error;
      toast({ title: "Reset email sent", description: `Recovery link sent to ${profile.email}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteUser = async (profile: any) => {
    if (!confirm(`Permanently delete user "${profile.full_name || profile.email}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.functions.invoke("admin-user-action", {
        body: { action: "delete_user", target_user_id: profile.id },
      });
      if (error) throw error;
      toast({ title: "User deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.functions.invoke("admin-user-action", {
        body: { action: "set_password", target_user_id: pwForm.user_id, new_password: pwForm.new_password },
      });
      if (error) throw error;
      toast({ title: "Password updated" });
      setPwDialogOpen(false);
      setPwForm({ user_id: "", new_password: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const filtered = (profiles || []).filter((p: any) =>
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">Manage system users and role assignments</p>
        </div>
        {isSuperuser && (
          <Button onClick={() => setInviteDialogOpen(true)} className="gap-2"><UserPlus className="w-4 h-4" />Add User</Button>
        )}
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." className="pl-10 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No users found.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((p: any) => {
                const role = getUserRole(p.id);
                return (
                  <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                    <td className="font-medium flex items-center gap-2"><Shield className="w-4 h-4 text-muted-foreground" />{p.full_name || "Unknown"}</td>
                    <td className="text-muted-foreground">{p.email || "—"}</td>
                    <td><Badge variant="outline" className={roleColors[role] || ""}>{roleLabels[role] || role}</Badge></td>
                    <td>
                      {isSuperuser && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditRole(p)}>Edit Role</Button>
                          <button title="Send reset email" onClick={() => handleResetPassword(p)} className="p-1.5 rounded hover:bg-muted"><KeyRound className="w-4 h-4 text-muted-foreground" /></button>
                          <button title="Set new password" onClick={() => { setPwForm({ user_id: p.id, new_password: "" }); setPwDialogOpen(true); }} className="p-1.5 rounded hover:bg-muted"><Lock className="w-4 h-4 text-muted-foreground" /></button>
                          <button title="Delete user" onClick={() => handleDeleteUser(p)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-4 h-4 text-destructive" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <EntityDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} title="Edit User Role">
        <form onSubmit={handleUpdateRole} className="space-y-4">
          <p className="text-sm text-muted-foreground">Changing role for: <strong>{selectedUser?.full_name}</strong></p>
          <div>
            <Label>Role</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={updateRoleMutation.isPending}>Update Role</Button>
        </form>
      </EntityDialog>

      <EntityDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} title="Add New User">
        <form onSubmit={handleInvite} className="space-y-4">
          <div><Label>Full Name *</Label><Input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} required className="mt-1" /></div>
          <div><Label>Email *</Label><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required className="mt-1" /></div>
          <div><Label>Password *</Label><Input type="password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} required minLength={6} className="mt-1" /></div>
          <div>
            <Label>Role</Label>
            <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
              {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={inviteLoading}>{inviteLoading ? "Creating..." : "Create User"}</Button>
        </form>
      </EntityDialog>

      <EntityDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} title="Set New Password">
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div><Label>New Password</Label><Input type="password" minLength={6} value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} required className="mt-1" /></div>
          <p className="text-xs text-muted-foreground">The user will be able to sign in immediately with this password.</p>
          <Button type="submit" className="w-full">Update Password</Button>
        </form>
      </EntityDialog>
    </div>
  );
}
