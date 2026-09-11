import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/modules/security/usePermissions";
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
import { isFacilityInfrastructureAvailable } from "@/lib/schemaFallback";

const SYSTEM_ADMIN_ROLES = new Set(["admin", "superuser"]);

export default function PreAuthorizationStudioRoute() {
  const offline = isOfflineMode();
  const { userRole } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const canReadPreAuth = can("preauth.read");
  const isSystemAdministrator = SYSTEM_ADMIN_ROLES.has(userRole ?? "");
  const [memberships, setMemberships] = useState<FacilityMembership[]>([]);
  const [facilities, setFacilities] = useState<PreAuthFacility[]>([]);
  const [facilityId, setFacilityId] = useState(getStoredFacilityId() || "");
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState("");

  useEffect(() => {
    if (offline || permissionsLoading || !canReadPreAuth) {
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
  }, [offline, permissionsLoading, canReadPreAuth, isSystemAdministrator]);

  const selectedMembership = useMemo(
    () => memberships.find((membership) => membership.facility_id === facilityId),
    [memberships, facilityId],
  );
  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId),
    [facilities, facilityId],
  );

  if (permissionsLoading) return <div className="stat-card">Checking pre-authorization access…</div>;
  if (!canReadPreAuth) {
    return (
      <div className="stat-card max-w-xl space-y-2">
        <h1 className="page-title">Access restricted</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to view pre-authorization records.</p>
      </div>
    );
  }

  if (offline) return <OfflinePreAuthorizationStudio />;
  if (loading) return <div className="stat-card">Loading facility access…</div>;
  if (error) return <div className="stat-card text-destructive">{error}</div>;

  // When facility scoping is not provisioned in this environment, everyone works
  // in a single implicit context instead of being blocked.
  if (!isFacilityInfrastructureAvailable()) return <PreAuthorizationStudio />;

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

    return (
      <div className="w-full min-w-0 space-y-3">
        <FacilityContextBar
          facilities={facilities}
          facilityId={facilityId}
          onFacilityChange={(value) => {
            setFacilityId(value);
            storeFacilityId(value);
          }}
          administrator
        />
        <PreAuthorizationStudio />
      </div>
    );
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

  return (
    <div className="w-full min-w-0 space-y-3">
      {memberships.length > 1 && (
        <FacilityContextBar
          facilities={memberships.map((membership) => membership.facility).filter(Boolean) as PreAuthFacility[]}
          facilityId={facilityId}
          onFacilityChange={(value) => {
            setFacilityId(value);
            storeFacilityId(value);
          }}
        />
      )}
      <PreAuthorizationStudio />
    </div>
  );
}

function FacilityContextBar({
  facilities,
  facilityId,
  onFacilityChange,
  administrator = false,
}: {
  facilities: PreAuthFacility[];
  facilityId: string;
  onFacilityChange: (value: string) => void;
  administrator?: boolean;
}) {
  const selected = facilities.find((facility) => facility.id === facilityId);
  if (!selected) return null;

  return (
    <section className="surface-card flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4" aria-label="Pre-authorization facility context">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Working facility</p>
          <p className="truncate text-sm font-semibold" title={selected.name}>{selected.name}</p>
          <p className="truncate text-xs text-muted-foreground">{administrator ? "System administrator context" : "Facility-scoped pre-authorization workspace"}</p>
        </div>
      </div>
      {facilities.length > 1 && (
        <div className="w-full min-w-0 sm:w-auto sm:min-w-[16rem]">
          <Label htmlFor="preauth-facility-context" className="sr-only">Working facility</Label>
          <select
            id="preauth-facility-context"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
            value={facilityId}
            onChange={(event) => onFacilityChange(event.target.value)}
          >
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}{facility.code ? ` (${facility.code})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
