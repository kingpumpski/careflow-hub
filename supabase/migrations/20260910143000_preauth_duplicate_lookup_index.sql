-- Keep the browser review lookup aligned with the server-side duplicate boundary.
-- The atomic writer already scopes duplicate fingerprints by facility; this index
-- makes the same facility + fingerprint access path efficient as data grows.

CREATE INDEX IF NOT EXISTS idx_pre_authorizations_facility_duplicate_signature
  ON public.pre_authorizations(facility_id, duplicate_signature, created_at DESC)
  WHERE lower(coalesce(status, '')) IN ('draft', 'prepared');

CREATE INDEX IF NOT EXISTS idx_pre_authorizations_facility_dedup_fingerprint
  ON public.pre_authorizations(facility_id, dedup_fingerprint, created_at DESC)
  WHERE lower(coalesce(status, '')) <> 'rejected';

COMMENT ON INDEX public.idx_pre_authorizations_facility_duplicate_signature IS
  'Supports facility-scoped duplicate review for active draft/prepared requests.';

COMMENT ON INDEX public.idx_pre_authorizations_facility_dedup_fingerprint IS
  'Supports facility-scoped authoritative duplicate detection for non-rejected requests.';
