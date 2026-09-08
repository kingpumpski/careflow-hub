import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import PreAuthorizationStudio from "@/pages/PreAuthorizationStudio";
import {
  getStoredFacilityId,
  listMyPreAuthFacilities,
  storeFacilityId,
  type FacilityMembership,
} from "@/features/preauth/services/preauthFacility.service";

export default function PreAuthorizationStudioRoute() {
  const [memberships, setMemberships] = useState<FacilityMembership[]>([]);
  const [facilityId, setFacilityId] = useState(getStoredFacilityId() || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listMyPreAuthFacilities()
      .then((rows) => {
        if (!active) return;
        setMemberships(rows);
        const stored = getStoredFacilityId();
        const storedIsValid = !!stored && rows.some((row) => row.facility_id === stored);
        if (storedIsValid) {
          setFacilityId(stored || "");
          return;
        }
        if (rows.length === 1) {
          setFacilityId(rows[0].facility_id);
          storeFacilityId(rows[0].facility_id);
        } else {
          setFacilityId("");
          storeFacilityId("");
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load facility access.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.facility_id === facilityId),
    [memberships, facilityId],
  );

  if (loading) return <div className="stat-card">Loading facility access…</div>;
  if (error) return <div className="stat-card text-destructive">{error}</div>;
  if (!memberships.length) {
    return (
      <div className="stat-card space-y-2">
        <h1 className="page-title">Facility access required</h1>
        <p className="text-sm text-muted-foreground">Your account is not assigned to an active facility. A facility membership is required before pre-authorization records can be created or frozen.</p>
      </div>
    );
  }

  if (!selectedMembership) {
    return (
      <div className="stat-card max-w-xl space-y-4">
        <div>
          <h1 className="page-title">Select facility</h1>
          <p className="page-description">All pre-authorization drafts, frozen revisions, prepared email packages and audit events are isolated by facility.</p>
        </div>
        <div>
          <Label>Facility</Label>
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={facilityId}
            onChange={(event) => {
              const value = event.target.value;
              setFacilityId(value);
              storeFacilityId(value);
            }}
          >
            <option value="">Select a facility…</option>
            {memberships.map((membership) => (
              <option key={membership.facility_id} value={membership.facility_id}>
                {membership.facility?.name || membership.facility_id}
                {membership.facility?.code ? ` (${membership.facility.code})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return <PreAuthorizationStudio />;
}
