-- Generated documents must always point to an immutable request version.
-- Storage/rendering is deliberately separated from request mutation so each
-- deployment can use its preferred PDF/document provider.

CREATE TABLE IF NOT EXISTS public.preauth_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'pre_authorization_request',
  file_name TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  sha256 TEXT,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (preauth_id, version_number, document_type)
);

CREATE INDEX IF NOT EXISTS preauth_documents_request_idx ON public.preauth_documents(preauth_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS preauth_documents_version_idx ON public.preauth_documents(preauth_id, version_number);

ALTER TABLE public.preauth_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preauth_documents_select ON public.preauth_documents;
CREATE POLICY preauth_documents_select ON public.preauth_documents
FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL);
REVOKE INSERT, UPDATE, DELETE ON public.preauth_documents FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_preauth_document(
  p_preauth_id UUID,
  p_version_number INTEGER,
  p_document_type TEXT,
  p_file_name TEXT DEFAULT NULL,
  p_storage_bucket TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_sha256 TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT 'application/pdf',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.preauth_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_document public.preauth_documents;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.preauthorization_versions v
    WHERE v.preauth_id = p_preauth_id AND v.version_number = p_version_number
  ) THEN
    RAISE EXCEPTION 'PREAUTH_VERSION_NOT_FOUND';
  END IF;

  INSERT INTO public.preauth_documents (
    preauth_id, version_number, document_type, file_name, storage_bucket,
    storage_path, sha256, content_type, generated_by, metadata
  ) VALUES (
    p_preauth_id, p_version_number, coalesce(NULLIF(trim(p_document_type), ''), 'pre_authorization_request'),
    p_file_name, p_storage_bucket, p_storage_path, p_sha256,
    coalesce(NULLIF(trim(p_content_type), ''), 'application/pdf'), (select auth.uid()), coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (preauth_id, version_number, document_type)
  DO UPDATE SET file_name = excluded.file_name, storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path, sha256 = excluded.sha256, content_type = excluded.content_type,
    metadata = excluded.metadata
  RETURNING * INTO v_document;
  RETURN v_document;
END;
$$;

REVOKE ALL ON FUNCTION public.register_preauth_document(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_preauth_document(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
