import { useEffect, useState } from "react";
import PreAuthStudio from "./PreAuthStudio";
import { listMyPreAuthFacilities, getStoredFacilityId, storeFacilityId, type FacilityMembership } from "@/features/preauth/services/preauthFacility.service";
import { getPreAuthorizationRevision } from "@/features/preauth/services/preauthStudio.service";
import { Label } from "@/components/ui/label";

export default function PreAuthForm(props: { onBack: () => void; editData?: any }) {
  const [memberships, setMemberships] = useState<FacilityMembership[]>([]);
  const [facilityId, setFacilityId] = useState(getStoredFacilityId() || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editSession, setEditSession] = useState<any>(props.editData || null);

  useEffect(() => {
    void listMyPreAuthFacilities()
      .then(async (rows) => {
        setMemberships(rows);
        if (!facilityId && rows.length === 1) {
          setFacilityId(rows[0].facility_id);
          storeFacilityId(rows[0].facility_id);
        }
        if (props.editData?.id) {
          const revision = await getPreAuthorizationRevision(String(props.editData.id));
          setEditSession({ ...props.editData, baseVersion: revision || props.editData.updated_at || props.editData.updatedAt || null });
        }
      })
      .catch((e) => setError(String(e?.message || e || "Unable to load facility or edit-session data.")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="stat-card">Loading facility access…</div>;
  if (error) return <div className="stat-card text-destructive">{error}</div>;
  if (!memberships.length) {
    return (
      <div className="stat-card space-y-2">
        <h1 className="page-title">Facility access required</h1>
        <p className="text-sm text-muted-foreground">Your account is not currently assigned to an active facility. Ask a facility administrator to add your account before creating pre-authorizations.</p>
      </div>
    );
  }
  if (!facilityId) {
    return (
      <div className="stat-card max-w-xl space-y-4">
        <div><h1 className="page-title">Select facility</h1><p className="page-description">Pre-authorizations, client suggestions and audit records are scoped to the facility handling the request.</p></div>
        <div>
          <Label>Facility</Label>
          <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); storeFacilityId(e.target.value); }}>
            <option value="">Select a facility…</option>
            {memberships.map((m) => <option key={m.facility_id} value={m.facility_id}>{m.facility?.name || m.facility_id} ({m.facility?.code || ""})</option>)}
          </select>
        </div>
        <button type="button" className="text-sm underline" onClick={() => props.onBack()}>Back</button>
      </div>
    );
  }

  if (!memberships.some((m) => m.facility_id === facilityId)) {
    storeFacilityId("");
    setFacilityId("");
    return null;
  }

  return <PreAuthStudio {...props} editData={editSession} />;
}
