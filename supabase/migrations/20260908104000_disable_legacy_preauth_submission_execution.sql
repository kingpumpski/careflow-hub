-- Disable the legacy executable pre-authorization submission pipeline.
-- CareFlow's supported boundary is document generation + email package handoff.
-- Historical legacy rows are retained for audit/migration purposes, but authenticated
-- clients must not queue/process/complete/fail external insurer submissions.

DROP FUNCTION IF EXISTS public.submit_preauthorization(UUID,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.process_preauth_submission(UUID);
DROP FUNCTION IF EXISTS public.complete_preauth_submission(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.fail_preauth_submission(UUID,TEXT,TEXT);

DO $$
BEGIN
  IF to_regclass('public.preauth_submissions') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.preauth_submissions FROM authenticated;
    REVOKE ALL ON public.preauth_submissions FROM anon;

    COMMENT ON TABLE public.preauth_submissions IS
      'Legacy submission execution register retained for historical compatibility only. New pre-authorization workflow must use immutable preauthorization_versions plus preauthorization_submissions email-handoff preparation records. External insurer submission execution is disabled.';
  END IF;
END $$;

COMMENT ON TABLE public.preauthorization_submissions IS
  'Authoritative document/email handoff register. Status prepared means ready for officer review/send; it does not mean externally submitted or delivered.';
