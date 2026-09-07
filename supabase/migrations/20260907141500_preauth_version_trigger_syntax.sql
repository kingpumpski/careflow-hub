-- Normalize deferred constraint-trigger declaration for PostgreSQL compatibility.
DROP TRIGGER IF EXISTS trg_capture_preauth_version ON public.pre_authorizations;

CREATE CONSTRAINT TRIGGER trg_capture_preauth_version
AFTER INSERT OR UPDATE ON public.pre_authorizations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.capture_preauth_version_deferred();
