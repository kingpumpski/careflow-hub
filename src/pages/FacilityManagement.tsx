import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, UserPlus, Users, ShieldCheck, RefreshCw, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { usePermissions } from "@/modules/security";
import { getStoredFacilityId, storeFacilityId } from "@/features/preauth/services/preauthFacility.service";
import { getCareFlowDataMode } from "@/modules/offline/data-mode";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type FacilityRow = {
  id: string;
  code: string;
  name: string;
  country_code: string | null;
  timezone: string;
  default_currency: string;
  date_format: string;
  active: boolean;
};
type MembershipRow = {
  id: string;
  facility_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};
type ProfileRow = { id: string; full_name: string; email: string | null };
type RpcResult = { data: unknown; error: { message: string } | null };

const callFacilityRpc = (name: string, args: Record<string, unknown>): Promise<RpcResult> =>
  (supabase.rpc as unknown as (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult>)(name, args);

export default function FacilityManagement() {
  const offline = getCareFlowDataMode() === "offline";
  const { can, loading: permissionsLoading } = usePermissions();
  const queryClient = useQueryClient();
  const canManageFacilities = !permissionsLoading && can("settings.manage");
  const canManageUsers = canManageFacilities && can("users.manage");
  const { data: facilities } = useSupabaseQuery("facilities", { orderBy: "name", enabled: !offline && canManageFacilities });
  const facilityRows = useMemo(() => (facilities ?? []) as FacilityRow[], [facilities]);
  const [selectedFacilityId, setSelectedFacilityId] = useState(() => getStoredFacilityId() ?? "");
  const { data: memberships } = useSupabaseQuery("facility_memberships", {
    orderBy: "created_at",
    filters: selectedFacilityId ? { facility_id: selectedFacilityId } : undefined,
    enabled: !offline && Boolean(selectedFacilityId) && canManageFacilities,
  });
  const { data: profiles } = useSupabaseQuery("profiles", { enabled: !offline && canManageUsers });
  const membershipRows = useMemo(() => (memberships ?? []) as MembershipRow[], [memberships]);
  const profileRows = useMemo(() => (profiles ?? []) as ProfileRow[], [profiles]);
  const profileById = useMemo(() => new Map(profileRows.map((profile) => [profile.id, profile])), [profileRows]);
  const selectedFacility = facilityRows.find((facility) => facility.id === selectedFacilityId) ?? null;
  const [creating, setCreating] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [facilityForm, setFacilityForm] = useState({
    code: "",
    name: "",
    country_code: "GH",
    timezone: "Africa/Accra",
    default_currency: "GHS",
    date_format: "DD/MM/YYYY",
  });
  const [memberForm, setMemberForm] = useState({ email: "", role: "member" });

  useEffect(() => {
    if (!facilityRows.length) {
      if (selectedFacilityId) setSelectedFacilityId("");
      return;
    }
    if (!facilityRows.some((facility) => facility.id === selectedFacilityId)) {
      const stored = getStoredFacilityId();
      setSelectedFacilityId(facilityRows.find((facility) => facility.id === stored)?.id ?? facilityRows[0].id);
    }
  }, [facilityRows, selectedFacilityId]);

  useEffect(() => {
    if (selectedFacilityId) storeFacilityId(selectedFacilityId);
  }, [selectedFacilityId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["facilities"] });
    await queryClient.invalidateQueries({ queryKey: ["facility_memberships"] });
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
  };

  const createFacility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageFacilities || !facilityForm.code.trim() || !facilityForm.name.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await callFacilityRpc("create_facility_with_owner", {
        p_code: facilityForm.code.trim().toUpperCase(),
        p_name: facilityForm.name.trim(),
        p_country_code: facilityForm.country_code.trim().toUpperCase() || null,
        p_timezone: facilityForm.timezone.trim(),
        p_default_currency: facilityForm.default_currency.trim().toUpperCase(),
        p_date_format: facilityForm.date_format,
      });
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] as { facility_id?: string; facility_code?: string } | undefined : data as { facility_id?: string; facility_code?: string } | null;
      if (!result?.facility_id) throw new Error("Facility was created but no facility reference was returned.");
      setSelectedFacilityId(result.facility_id);
      storeFacilityId(result.facility_id);
      setFacilityForm({ code: "", name: "", country_code: "GH", timezone: "Africa/Accra", default_currency: "GHS", date_format: "DD/MM/YYYY" });
      toast({ title: "Facility created", description: `${result.facility_code ?? "Facility"} is ready. Your account was added as its first owner.` });
      await refresh();
    } catch (cause) {
      toast({ title: "Unable to create facility", description: cause instanceof Error ? cause.message : "Facility creation failed.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFacilityId || !memberForm.email.trim() || !canManageUsers) return;
    setAddingMember(true);
    try {
      const { data, error } = await callFacilityRpc("add_facility_member_by_email", {
        p_facility_id: selectedFacilityId,
        p_email: memberForm.email.trim(),
        p_membership_role: memberForm.role,
      });
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] as { email?: string } | undefined : data as { email?: string } | null;
      toast({ title: "Facility access granted", description: result?.email ?? memberForm.email.trim() });
      setMemberForm({ email: "", role: "member" });
      await queryClient.invalidateQueries({ queryKey: ["facility_memberships"] });
    } catch (cause) {
      toast({ title: "Unable to add member", description: cause instanceof Error ? cause.message : "Membership could not be saved.", variant: "destructive" });
    } finally {
      setAddingMember(false);
    }
  };

  const suspendMember = async (membership: MembershipRow) => {
    if (!canManageUsers) return;
    const reason = window.prompt("Enter the reason for suspending this user's facility access:");
    if (!reason?.trim()) return;
    try {
      const { error } = await callFacilityRpc("deactivate_facility_member", {
        p_membership_id: membership.id,
        p_reason: reason.trim(),
      });
      if (error) throw new Error(error.message);
      toast({ title: "Facility access suspended" });
      await queryClient.invalidateQueries({ queryKey: ["facility_memberships"] });
    } catch (cause) {
      toast({ title: "Unable to suspend access", description: cause instanceof Error ? cause.message : "Membership could not be updated.", variant: "destructive" });
    }
  };

  if (permissionsLoading) return <div className="stat-card py-12 text-center text-sm text-muted-foreground">Checking administrator access…</div>;
  if (!canManageFacilities) return <div className="stat-card py-12 text-center text-sm text-muted-foreground">System settings permission is required to manage facilities.</div>;

  return <div className="space-y-6 min-w-0">
    <header className="page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="page-title">Facilities & Access</h1><p className="page-description">Onboard facilities and control which existing CareFlow users can access each facility.</p></div><Button variant="outline" onClick={() => void refresh()} disabled={offline}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></header>
    {offline && <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">Facility administration requires an online connection.</div>}

    <section className="stat-card space-y-4">
      <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><h2 className="font-semibold">Create a facility</h2></div>
      <p className="text-sm text-muted-foreground">Creating a facility automatically adds your administrator account as its first active owner. No facility is created until you submit this form.</p>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void createFacility(event)}>
        <div className="space-y-2"><Label htmlFor="facility-code">Facility code *</Label><Input id="facility-code" required maxLength={20} value={facilityForm.code} onChange={(event) => setFacilityForm((old) => ({ ...old, code: event.target.value.toUpperCase() }))} placeholder="e.g. HOSPITAL-01" /></div>
        <div className="space-y-2"><Label htmlFor="facility-name">Facility name *</Label><Input id="facility-name" required maxLength={160} value={facilityForm.name} onChange={(event) => setFacilityForm((old) => ({ ...old, name: event.target.value }))} placeholder="Registered facility name" /></div>
        <div className="space-y-2"><Label htmlFor="facility-country">Country code (ISO)</Label><Input id="facility-country" maxLength={2} value={facilityForm.country_code} onChange={(event) => setFacilityForm((old) => ({ ...old, country_code: event.target.value.toUpperCase() }))} /></div>
        <div className="space-y-2"><Label htmlFor="facility-timezone">IANA time zone</Label><Input id="facility-timezone" required value={facilityForm.timezone} onChange={(event) => setFacilityForm((old) => ({ ...old, timezone: event.target.value }))} placeholder="Africa/Accra" /></div>
        <div className="space-y-2"><Label htmlFor="facility-currency">Default currency (ISO 4217)</Label><Input id="facility-currency" required maxLength={3} value={facilityForm.default_currency} onChange={(event) => setFacilityForm((old) => ({ ...old, default_currency: event.target.value.toUpperCase() }))} /></div>
        <div className="space-y-2"><Label htmlFor="facility-date-format">Date format</Label><select id="facility-date-format" value={facilityForm.date_format} onChange={(event) => setFacilityForm((old) => ({ ...old, date_format: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="DD-MM-YYYY">DD-MM-YYYY</option><option value="MM-DD-YYYY">MM-DD-YYYY</option></select></div>
        <div className="md:col-span-2"><Button type="submit" disabled={creating || offline}>{creating ? "Creating…" : "Create facility and assign owner"}</Button></div>
      </form>
    </section>

    <section className="stat-card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><h2 className="font-semibold">Registered facilities</h2></div><Badge variant="outline">{facilityRows.length} facilities</Badge></div>
      {!facilityRows.length ? <p className="rounded-md border p-5 text-sm text-muted-foreground">No facilities have been registered yet. Create the first facility above to enable facility-scoped workflows.</p> : <div className="space-y-3"><Label htmlFor="facility-select">Manage facility</Label><select id="facility-select" value={selectedFacilityId} onChange={(event) => setSelectedFacilityId(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">{facilityRows.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} ({facility.code})</option>)}</select>{selectedFacility && <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Country:</span> {selectedFacility.country_code ?? "—"}</p><p><span className="text-muted-foreground">Currency:</span> {selectedFacility.default_currency}</p><p><span className="text-muted-foreground">Time zone:</span> {selectedFacility.timezone}</p><p><span className="text-muted-foreground">Date format:</span> {selectedFacility.date_format}</p></div>}</div>}
    </section>

    {selectedFacility && <section className="stat-card space-y-4">
      <div className="flex items-center gap-2"><Users className="h-5 w-5" /><h2 className="font-semibold">Facility membership</h2><Badge variant="outline">{membershipRows.length} users</Badge></div>
      {canManageUsers && <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={(event) => void addMember(event)}>
        <div className="space-y-2"><Label htmlFor="member-email">Existing user email</Label><Input id="member-email" type="email" required value={memberForm.email} onChange={(event) => setMemberForm((old) => ({ ...old, email: event.target.value }))} placeholder="user@example.com" /></div>
        <div className="space-y-2"><Label htmlFor="member-role">Facility label</Label><select id="member-role" value={memberForm.role} onChange={(event) => setMemberForm((old) => ({ ...old, role: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="member">Member</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></div>
        <div className="flex items-end"><Button type="submit" disabled={addingMember || offline}><UserPlus className="mr-2 h-4 w-4" />{addingMember ? "Adding…" : "Add user"}</Button></div>
      </form>}
      <div className="rounded-md border p-3 text-xs text-muted-foreground">Facility membership controls which facility data a user can access. It does not grant global application permissions. Assign the user's Claims, Payments or other application role separately in User Management.</div>
      {!membershipRows.length ? <p className="text-sm text-muted-foreground py-4">No members found for this facility.</p> : <div className="overflow-x-auto"><table className="data-table min-w-[620px]"><thead><tr><th>User</th><th>Facility label</th><th>Status</th><th>Added</th><th>Action</th></tr></thead><tbody>{membershipRows.map((membership) => {
        const profile = profileById.get(membership.user_id);
        return <tr key={membership.id}><td><div className="font-medium">{profile?.full_name || profile?.email || membership.user_id}</div>{profile?.email && <div className="text-xs text-muted-foreground">{profile.email}</div>}</td><td>{membership.role}</td><td><Badge variant={membership.status === "active" ? "secondary" : "outline"}>{membership.status}</Badge></td><td>{new Date(membership.created_at).toLocaleDateString()}</td><td>{canManageUsers && membership.status === "active" ? <Button size="sm" variant="ghost" onClick={() => void suspendMember(membership)}><Ban className="mr-1 h-4 w-4" />Suspend</Button> : "—"}</td></tr>;
      })}</tbody></table></div>}
    </section>}

    <section className="rounded-lg border bg-muted/20 p-4 flex items-start gap-3"><ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-medium">Protected administration</p><p className="text-xs text-muted-foreground">Facility creation and membership changes are handled by authenticated server-side RPCs, restricted to system administrators and recorded in the audit log. Direct browser writes to facility membership are not used.</p></div></section>
  </div>;
}
