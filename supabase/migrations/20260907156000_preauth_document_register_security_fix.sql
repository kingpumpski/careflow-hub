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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_document public.preauth_documents; v_facility UUID;
BEGIN
  IF (select auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT facility_id INTO v_facility FROM public.pre_authorizations WHERE id=p_preauth_id;
  IF v_facility IS NULL OR NOT public.user_has_facility_access(v_facility) THEN RAISE EXCEPTION 'FACILITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_version_number IS NULL OR p_version_number < 1 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_VERSION'; END IF;
  IF p_document_type IS NULL OR length(trim(p_document_type))=0 OR length(p_document_type)>100 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE'; END IF;
  IF p_format IS NULL OR length(trim(p_format))=0 OR length(p_format)>20 THEN RAISE EXCEPTION 'INVALID_DOCUMENT_FORMAT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.preauthorization_versions v WHERE v.preauth_id=p_preauth_id AND v.version_number=p_version_number) THEN RAISE EXCEPTION 'VERSION_NOT_FOUND'; END IF;

  INSERT INTO public.preauth_documents(facility_id,preauth_id,version_number,document_type,format,storage_provider,storage_path,content_sha256,status,generated_by,metadata)
  VALUES(v_facility,p_preauth_id,p_version_number,trim(p_document_type),lower(trim(p_format)),NULLIF(trim(p_storage_provider),''),NULLIF(trim(p_storage_path),''),NULLIF(lower(trim(p_content_sha256)),''),p_status,(select auth.uid()),coalesce(p_metadata,'{}'::jsonb))
  ON CONFLICT (preauth_id,version_number,document_type,format) DO UPDATE SET storage_provider=EXCLUDED.storage_provider,storage_path=EXCLUDED.storage_path,content_sha256=EXCLUDED.content_sha256,status=EXCLUDED.status,generated_by=EXCLUDED.generated_by,metadata=EXCLUDED.metadata
  RETURNING * INTO v_document;
  RETURN v_document;
END;
$$;

REVOKE ALL ON FUNCTION public.register_preauth_document(UUID,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_preauth_document(UUID,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;
