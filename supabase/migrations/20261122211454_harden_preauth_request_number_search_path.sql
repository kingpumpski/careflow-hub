-- Forward-only hardening of the pre-authorization request-number trigger.
-- The historical SECURITY DEFINER implementation used search_path=public.
-- Keep the trigger behavior while removing writable-schema name resolution.
CREATE OR REPLACE FUNCTION security_internal.set_preauth_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.request_number IS NULL OR pg_catalog.btrim(NEW.request_number) = '' THEN
    NEW.request_number :=
      'PA-' ||
      extract(year FROM COALESCE(NEW.created_at, pg_catalog.now()))::text ||
      '-' ||
      pg_catalog.upper(
        pg_catalog.substr(
          pg_catalog.replace(NEW.id::text, '-', ''),
          1,
          8
        )
      );
  END IF;
  RETURN NEW;
END;
$function$;
