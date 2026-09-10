import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import PreAuthorizationStudio from "@/pages/PreAuthorizationStudio";
import OfflinePreAuthorizationStudio from "@/pages/OfflinePreAuthorizationStudio";
import { isOfflineMode } from "@/modules/offline/data-mode";
import {
  getStoredFacilityId,
  listAllActivePreAuthFacilities,
  listMyPreAuthFacilities,
  storeFacilityId,
  type FacilityMembership,
  type PreAuthFacility,
} from "@/features/preauth/services/preauthFacility.service";

const SYSTEM_ADMIN_ROLES = new Set(["admin", "superuser"]);

export default function PreAuthorizationStudioRoute() {
  const offline = isOfflineMode();
  const { userRole } = useAuth();
  const isSystemAdministrator = SYSTEM_ADMIN_ROLES.has(userRole ?? "");
  const [memberships, setMemberships] = useState<FacilityMembership[]>([]);
  const [facilities, setFacilities] = useState<PreAuthFacility[]>([]);
  const [facilityId, setFacilityId] = useState(getStoredFacilityId() || "");
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState("");

  useEffect(() => {
    if (offline) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");

    const load = async () => {
      if (isSystemAdministrator) {
        const rows = await listAllActivePreAuthFacilities();
        if (!active) return;
        setFacilities(rows);
        const stored = getStoredFacilityId();
        const storedIsValid = !!stored && rows.some((row) => row.id === stored);
        if (storedIsValid) setFacilityId(stored || "");
        else if (rows.length === 1) {
          setFacilityId(rows[0].id);
          storeFacilityId(rows[0].id);
        } else {
          setFacilityId("");
          storeFacilityId("");
        }
        return;
      }

      const rows = await listMyPreAuthFacilities();
      if (!active) return;
      setMemberships(rows);
      const stored = getStoredFacilityId();
      const storedIsValid = !!stored && rows.some((row) => row.facility_id === stored);
      if (storedIsValid) setFacilityId(stored || "");
      else if (rows.length === 1) {
        setFacilityId(rows[0].facility_id);
        storeFacilityId(rows[0].facility_id);
      } else {
        setFacilityId("");
        storeFacilityId("");
      }
    };

    void load()
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load facility access.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [offline, isSystemAdministrator]);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.facility_id === facilityId),
    [memberships, facilityId],
  );
  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId),
    [facilities, facilityId],
  );

  if (offline) return <OfflinePreAuthorizationStudio />;
  if (loading) return <div className="stat-card">Loading facility access…</div>;
  if (error) return <div className="stat-card text-destructive">{error}</div>;

  if (isSystemAdministrator) {
    if (!facilities.length) {
      return (
        <div className="stat-card space-y-2">
          <h1 className="page-title">No active facility configured</h1>
          <p className="text-sm text-muted-foreground">System administrators have global access, but the Pre-Authorization Studio needs at least one active facility to create a facility-scoped request.</p>
        </div>
      );
    }

    if (!selectedFacility) {
      return (
        <div className="stat-card max-w-xl space-y-4">
          <div>
            <h1 className="page-title">Select facility</h1>
            <p className="page-description">System administrators can work across every active facility. Select the facility that should own the new pre-authorization request.</p>
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
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}{facility.code ? ` (${facility.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    return <PreAuthorizationStudio />;
  }

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
