import { useState } from "react";
import { UserCircle, Save, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function Profile() {
  const { user, profile, userRole } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await (supabase.from("profiles") as any)
      .update({ full_name: fullName })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Profile updated" });
  };

  const changePassword = async () => {
    if (newPassword.length < 6) { toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" }); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Password changed" }); setNewPassword(""); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><UserCircle className="w-6 h-6 text-primary" />My Profile</h1>
        <p className="page-description">Manage your account details and password</p>
      </div>

      <div className="stat-card space-y-4">
        <h3 className="font-heading font-semibold">Account Details</h3>
        <div>
          <Label>Email</Label>
          <Input value={user?.email || ""} disabled className="mt-1" />
        </div>
        <div>
          <Label>Full Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Role</Label>
          <Input value={userRole || "viewer"} disabled className="mt-1" />
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />Save Changes
        </Button>
      </div>

      <div className="stat-card space-y-4">
        <h3 className="font-heading font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" />Change Password</h3>
        <div>
          <Label>New Password</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" placeholder="Minimum 6 characters" />
        </div>
        <Button onClick={changePassword} disabled={!newPassword} variant="outline">Update Password</Button>
      </div>
    </div>
  );
}
