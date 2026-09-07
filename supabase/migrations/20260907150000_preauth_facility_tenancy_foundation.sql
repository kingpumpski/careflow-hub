-- Global multi-facility tenancy foundation for Pre-Authorization.
-- This layer is intentionally insurer-neutral and country-neutral.

CREATE TABLE IF NOT EXISTS public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code CHAR(2),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facilities_code_key UNIQUE (code),
  CONSTRAINT facilities_currency_ck CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT facilities_country_ck CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS public.facility_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_membership_unique UNIQUE (facility_id, user_id),
  CONSTRAINT facility_membership_status_ck CHECK (status IN ('active','invited','suspended'))
);

CREATE INDEX IF NOT EXISTS facility_memberships_user_idx
  ON public.facility_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS facility_memberships_facility_idx
  ON public.facility_memberships(facility_id, status);

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facilities_select_member ON public.facilities;
CREATE POLICY facilities_select_member ON public.facilities
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.facility_memberships fm
    WHERE fm.facility_id = facilities.id
      AND fm.user_id = (select auth.uid())
      AND fm.status = 'active'
  ));

DROP POLICY IF EXISTS facility_memberships_select_member ON public.facility_memberships;
CREATE POLICY facility_memberships_select_member ON public.facility_memberships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR EXISTS (
    SELECT 1 FROM public.facility_memberships own
    WHERE own.facility_id = facility_memberships.facility_id
      AND own.user_id = (select auth.uid())
      AND own.status = 'active'
      AND own.role IN ('owner','admin','manager')
  ));

REVOKE INSERT, UPDATE, DELETE ON public.facilities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.facility_memberships FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.user_has_facility_access(p_facility_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facility_memberships fm
    WHERE fm.facility_id = p_facility_id
      AND fm.user_id = (select auth.uid())
      AND fm.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_facility_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_facility_access(UUID) TO authenticated;

-- Pre-Authorization records become facility-aware without forcing a destructive
-- migration of historical rows. New application writes must provide a facility.
ALTER TABLE public.pre_authorizations
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauth_client_suggestions
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
ALTER TABLE public.preauthorization_versions
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauth_submissions
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauth_documents
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;
ALTER TABLE public.preauth_audit_events
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS preauth_facility_time_idx
  ON public.pre_authorizations(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preauth_suggestions_facility_name_idx
  ON public.preauth_client_suggestions(facility_id, normalized_name);
CREATE INDEX IF NOT EXISTS preauth_versions_facility_request_idx
  ON public.preauthorization_versions(facility_id, preauth_id, version_number DESC);
CREATE INDEX IF NOT EXISTS preauth_submissions_facility_time_idx
  ON public.preauth_submissions(facility_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS preauth_documents_facility_time_idx
  ON public.preauth_documents(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preauth_audit_facility_time_idx
  ON public.preauth_audit_events(facility_id, created_at DESC);

COMMENT ON TABLE public.facilities IS 'Tenant boundary for deployable healthcare/claims operations facilities.';
COMMENT ON TABLE public.facility_memberships IS 'Authoritative user-to-facility membership and role boundary.';
COMMENT ON COLUMN public.pre_authorizations.facility_id IS 'Owning facility/tenant. Required for all new application-created requests.';
COMMENT ON COLUMN public.preauth_client_suggestions.facility_id IS 'Facility-scoped convenience memory; never represents insurer ownership.';
