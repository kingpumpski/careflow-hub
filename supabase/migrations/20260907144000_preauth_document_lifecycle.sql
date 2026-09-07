-- Pre-Authorization document lifecycle and immutable version binding.
-- Documents are metadata only; binary rendering/storage remains provider-neutral.

CREATE TABLE IF NOT EXISTS public.preauth_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID NOT NULL REFERENCES public.pre_authorizations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'preauthorization_request',
  format TEXT NOT NULL DEFAULT 'pdf',
  storage_provider TEXT,
  storage_path TEXT,
  content_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'generated',
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT preauth_documents_version_positive CHECK (version_number > 0),
  CONSTRAINT preauth_documents_status_valid CHECK (status IN ('pending','generated','failed','superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS preauth_documents_version_type_idx
  ON public.preauth_documents(preauth_id, version_number, document_type, format);

CREATE INDEX IF NOT EXISTS preauth_documents_request_idx
  ON public.preauth_documents(preauth_id, created_at DESC);

ALTER TABLE public.preauth_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS preauth_documents_select_authenticated ON public.preauth_documents;
CREATE POLICY preauth_documents_select_authenticated
  ON public.preauth_documents FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.preauth_documents FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_preauth_document(
  p_preauth_id UUID,
  p_version_number INTEGER,
  p_document_type TEXT DEFAULT 'preauthorization_request',
  p_format TEXT DEFAULT 'pdf',
  p_storage_provider TEXT DEFAULT NULL,
  p_storage_path TEXT DEFAULT NULL,
  p_content_sha256 TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'generated',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.preauth_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document public.preauth_documents;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_preauth_id IS NULL OR p_version_number IS NULL OR p_version_number < 1 THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_VERSION';
  END IF;

  IF p_document_type IS NULL OR length(trim(p_document_type)) = 0 OR length(p_document_type) > 100 THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE';
  END IF;

  IF p_format IS NULL OR length(trim(p_format)) = 0 OR length(p_format) > 20 THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_FORMAT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pre_authorization_versions v
    WHERE v.preauth_id = p_preauth_id
      AND v.version_number = p_version_number
  ) THEN
    RAISE EXCEPTION 'VERSION_NOT_FOUND';
  END IF;

  INSERT INTO public.preauth_documents (
    preauth_id, version_number, document_type, format,
    storage_provider, storage_path, content_sha256, status,
    generated_by, metadata
  ) VALUES (
    p_preauth_id, p_version_number, trim(p_document_type), lower(trim(p_format)),
    NULLIF(trim(p_storage_provider), ''), NULLIF(trim(p_storage_path), ''),
    NULLIF(lower(trim(p_content_sha256)), ''), p_status,
    (select auth.uid()), coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (preauth_id, version_number, document_type, format)
  DO UPDATE SET
    storage_provider = EXCLUDED.storage_provider,
    storage_path = EXCLUDED.storage_path,
    content_sha256 = EXCLUDED.content_sha256,
    status = EXCLUDED.status,
    generated_by = EXCLUDED.generated_by,
    metadata = EXCLUDED.metadata
  RETURNING * INTO v_document;

  RETURN v_document;
END;
$$;

REVOKE ALL ON FUNCTION public.register_preauth_document(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_preauth_document(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_preauth_document(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
