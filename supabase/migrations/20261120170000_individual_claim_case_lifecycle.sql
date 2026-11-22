-- Individual claim cases are deliberately separate from public.claims,
-- which remains the insurer-level monthly aggregate ledger.
CREATE TABLE IF NOT EXISTS public.claim_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  claim_number text NOT NULL,
  insurance_company_id uuid NOT NULL REFERENCES public.insurance_companies(id) ON DELETE RESTRICT,
  preauth_id uuid NULL REFERENCES public.pre_authorizations(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  member_number text NULL,
  procedure_name text NULL,
  date_of_service date NOT NULL,
  service_period_start date NOT NULL,
  service_period_end date NOT NULL,
  diagnosis text NULL,
  clinical_notes text NULL,
  submitted_amount numeric(14,2) NOT NULL CHECK (submitted_amount > 0),
  approved_amount numeric(14,2) NULL CHECK (approved_amount IS NULL OR approved_amount >= 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','verified','submitted','acknowledged','under_review','queried',
      'approved','partially_approved','rejected','appealed','partially_paid',
      'paid','reconciled','closed'
    )),
  denial_reason text NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  approved_at timestamptz NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  CONSTRAINT claim_cases_period_order CHECK (service_period_start <= service_period_end),
  CONSTRAINT claim_cases_service_in_period CHECK (date_of_service BETWEEN service_period_start AND service_period_end),
  CONSTRAINT claim_cases_facility_number_unique UNIQUE (facility_id, claim_number)
);

CREATE INDEX IF NOT EXISTS idx_claim_cases_facility_status_created
  ON public.claim_cases (facility_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_cases_facility_insurer_service
  ON public.claim_cases (facility_id, insurance_company_id, date_of_service DESC);
CREATE INDEX IF NOT EXISTS idx_claim_cases_preauth
  ON public.claim_cases (preauth_id) WHERE preauth_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.claim_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  claim_case_id uuid NOT NULL REFERENCES public.claim_cases(id) ON DELETE RESTRICT,
  from_status text NULL,
  to_status text NOT NULL,
  note text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_case_events_case_created
  ON public.claim_case_events (claim_case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_case_events_facility_created
  ON public.claim_case_events (facility_id, created_at DESC);

ALTER TABLE public.claim_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claim_cases_select_facility_permission ON public.claim_cases;
CREATE POLICY claim_cases_select_facility_permission
  ON public.claim_cases FOR SELECT TO authenticated
  USING (
    security_internal.user_has_facility_access(facility_id)
    AND security_internal.current_user_has_permission('claims.read')
  );

DROP POLICY IF EXISTS claim_case_events_select_facility_permission ON public.claim_case_events;
CREATE POLICY claim_case_events_select_facility_permission
  ON public.claim_case_events FOR SELECT TO authenticated
  USING (
    security_internal.user_has_facility_access(facility_id)
    AND security_internal.current_user_has_permission('claims.read')
  );

-- The two RPCs below are the only authenticated write path. This prevents
-- direct PostgREST writes from bypassing lifecycle validation and event logging.
REVOKE ALL ON TABLE public.claim_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.claim_case_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.claim_cases, public.claim_case_events TO authenticated;

CREATE OR REPLACE FUNCTION security_internal.reject_claim_case_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Claim case events are immutable';
END;
$function$;

REVOKE ALL ON FUNCTION security_internal.reject_claim_case_event_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS claim_case_events_immutable ON public.claim_case_events;
CREATE TRIGGER claim_case_events_immutable
  BEFORE UPDATE OR DELETE ON public.claim_case_events
  FOR EACH ROW EXECUTE FUNCTION security_internal.reject_claim_case_event_mutation();

CREATE OR REPLACE FUNCTION security_internal.create_individual_claim_case(
  p_facility_id uuid,
  p_insurance_company_id uuid,
  p_patient_name text,
  p_date_of_service date,
  p_submitted_amount numeric,
  p_member_number text DEFAULT NULL,
  p_procedure_name text DEFAULT NULL,
  p_diagnosis text DEFAULT NULL,
  p_clinical_notes text DEFAULT NULL,
  p_preauth_id uuid DEFAULT NULL,
  p_service_period_start date DEFAULT NULL,
  p_service_period_end date DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS TABLE (case_id uuid, claim_number text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_facility_currency text;
  v_period_start date;
  v_period_end date;
  v_currency text;
  v_claim_number text;
  v_case_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT security_internal.current_user_has_permission('claims.write') THEN
    RAISE EXCEPTION 'claims.write permission is required';
  END IF;
  IF p_facility_id IS NULL OR NOT security_internal.user_has_facility_access(p_facility_id) THEN
    RAISE EXCEPTION 'You do not have access to the selected facility';
  END IF;
  IF p_insurance_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.insurance_companies i
    WHERE i.id = p_insurance_company_id AND i.is_active = true
  ) THEN
    RAISE EXCEPTION 'Select an active insurance company';
  END IF;
  IF coalesce(length(trim(p_patient_name)), 0) = 0 THEN
    RAISE EXCEPTION 'Patient name is required';
  END IF;
  IF p_date_of_service IS NULL OR p_submitted_amount IS NULL OR p_submitted_amount <= 0 THEN
    RAISE EXCEPTION 'A service date and positive submitted amount are required';
  END IF;

  SELECT f.default_currency INTO v_facility_currency
  FROM public.facilities f
  WHERE f.id = p_facility_id AND f.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected facility is inactive or unavailable';
  END IF;

  IF p_preauth_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pre_authorizations pa
    WHERE pa.id = p_preauth_id
      AND pa.facility_id = p_facility_id
      AND pa.insurance_company_id = p_insurance_company_id
  ) THEN
    RAISE EXCEPTION 'The linked pre-authorization must belong to the same facility and insurer';
  END IF;

  v_period_start := coalesce(p_service_period_start, date_trunc('month', p_date_of_service)::date);
  v_period_end := coalesce(
    p_service_period_end,
    (date_trunc('month', p_date_of_service) + interval '1 month - 1 day')::date
  );
  IF v_period_start > v_period_end OR p_date_of_service NOT BETWEEN v_period_start AND v_period_end THEN
    RAISE EXCEPTION 'The service date must fall within the claim service period';
  END IF;

  v_currency := upper(trim(coalesce(nullif(p_currency, ''), v_facility_currency, 'GHS')));
  IF length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO currency code';
  END IF;

  v_claim_number := 'IC-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_case_id := gen_random_uuid();

  INSERT INTO public.claim_cases (
    id, facility_id, claim_number, insurance_company_id, preauth_id,
    patient_name, member_number, procedure_name, date_of_service,
    service_period_start, service_period_end, diagnosis, clinical_notes,
    submitted_amount, currency, status, created_by
  ) VALUES (
    v_case_id, p_facility_id, v_claim_number, p_insurance_company_id, p_preauth_id,
    trim(p_patient_name), nullif(trim(coalesce(p_member_number, '')), ''),
    nullif(trim(coalesce(p_procedure_name, '')), ''), p_date_of_service,
    v_period_start, v_period_end, nullif(trim(coalesce(p_diagnosis, '')), ''),
    nullif(trim(coalesce(p_clinical_notes, '')), ''),
    round(p_submitted_amount, 2), v_currency, 'draft', v_user_id
  );

  INSERT INTO public.claim_case_events (
    facility_id, claim_case_id, from_status, to_status, note, actor_id, metadata
  ) VALUES (
    p_facility_id, v_case_id, NULL, 'draft', 'Individual claim case created', v_user_id,
    jsonb_build_object('claim_number', v_claim_number, 'submitted_amount', round(p_submitted_amount, 2), 'currency', v_currency)
  );

  RETURN QUERY SELECT v_case_id, v_claim_number, 'draft'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION security_internal.claim_case_transition_allowed(
  p_from_status text,
  p_to_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE p_from_status
    WHEN 'draft' THEN p_to_status = 'verified'
    WHEN 'verified' THEN p_to_status IN ('submitted', 'draft')
    WHEN 'submitted' THEN p_to_status IN ('acknowledged', 'under_review', 'queried', 'rejected')
    WHEN 'acknowledged' THEN p_to_status IN ('under_review', 'queried', 'rejected')
    WHEN 'under_review' THEN p_to_status IN ('queried', 'approved', 'partially_approved', 'rejected')
    WHEN 'queried' THEN p_to_status IN ('verified', 'submitted', 'under_review', 'rejected')
    WHEN 'approved' THEN p_to_status IN ('partially_paid', 'paid', 'reconciled')
    WHEN 'partially_approved' THEN p_to_status IN ('partially_paid', 'paid', 'appealed', 'reconciled')
    WHEN 'rejected' THEN p_to_status IN ('appealed', 'closed', 'submitted')
    WHEN 'appealed' THEN p_to_status IN ('approved', 'partially_approved', 'rejected', 'closed')
    WHEN 'partially_paid' THEN p_to_status IN ('paid', 'reconciled')
    WHEN 'paid' THEN p_to_status IN ('reconciled', 'closed')
    WHEN 'reconciled' THEN p_to_status = 'closed'
    WHEN 'closed' THEN false
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION security_internal.claim_case_transition_allowed(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION security_internal.transition_individual_claim_case(
  p_claim_case_id uuid,
  p_target_status text,
  p_note text,
  p_approved_amount numeric DEFAULT NULL,
  p_paid_amount numeric DEFAULT NULL,
  p_denial_reason text DEFAULT NULL
)
RETURNS TABLE (case_id uuid, claim_number text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_case public.claim_cases%ROWTYPE;
  v_allowed boolean := false;
  v_approved numeric(14,2);
  v_paid numeric(14,2);
  v_denial_reason text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT security_internal.current_user_has_permission('claims.write') THEN
    RAISE EXCEPTION 'claims.write permission is required';
  END IF;
  IF p_claim_case_id IS NULL THEN
    RAISE EXCEPTION 'Claim case is required';
  END IF;
  IF coalesce(length(trim(p_note)), 0) = 0 THEN
    RAISE EXCEPTION 'A note is required for every lifecycle transition';
  END IF;
  IF p_target_status NOT IN (
    'draft','verified','submitted','acknowledged','under_review','queried',
    'approved','partially_approved','rejected','appealed','partially_paid',
    'paid','reconciled','closed'
  ) THEN
    RAISE EXCEPTION 'Unknown claim lifecycle status: %', p_target_status;
  END IF;

  SELECT c.* INTO v_case
  FROM public.claim_cases c
  WHERE c.id = p_claim_case_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim case not found';
  END IF;
  IF NOT security_internal.user_has_facility_access(v_case.facility_id) THEN
    RAISE EXCEPTION 'You do not have access to this claim case';
  END IF;

  v_allowed := security_internal.claim_case_transition_allowed(v_case.status, p_target_status);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid claim lifecycle transition: % -> %', v_case.status, p_target_status;
  END IF;

  -- Financial amounts may only change at the lifecycle stages that adjudicate
  -- or record payment. Later status-only transitions must preserve settled values.
  v_approved := v_case.approved_amount;
  v_paid := v_case.paid_amount;
  IF p_target_status IN ('approved', 'partially_approved') THEN
    v_approved := coalesce(p_approved_amount, v_case.approved_amount);
  END IF;
  IF p_target_status IN ('partially_paid', 'paid') THEN
    v_paid := coalesce(p_paid_amount, v_case.paid_amount);
  END IF;
  v_denial_reason := coalesce(nullif(trim(coalesce(p_denial_reason, '')), ''), nullif(trim(coalesce(p_note, '')), ''));

  IF p_target_status IN ('approved', 'partially_approved') THEN
    IF v_approved IS NULL OR v_approved <= 0 OR v_approved > v_case.submitted_amount THEN
      RAISE EXCEPTION 'Approved amount must be positive and cannot exceed the submitted amount';
    END IF;
    IF p_target_status = 'partially_approved' AND v_approved >= v_case.submitted_amount THEN
      RAISE EXCEPTION 'Partially approved amount must be less than the submitted amount';
    END IF;
  END IF;

  IF p_target_status IN ('partially_paid', 'paid') THEN
    IF v_approved IS NULL OR v_approved <= 0 OR v_paid <= 0 OR v_paid > v_approved THEN
      RAISE EXCEPTION 'Payment amount must be positive and cannot exceed the approved amount';
    END IF;
    IF v_paid < v_case.paid_amount THEN
      RAISE EXCEPTION 'Cumulative paid amount cannot decrease';
    END IF;
    IF p_target_status = 'partially_paid' AND v_paid >= v_approved THEN
      RAISE EXCEPTION 'Use Paid when the full approved amount has been received';
    END IF;
    IF p_target_status = 'paid' AND v_paid <> v_approved THEN
      RAISE EXCEPTION 'Paid status requires the cumulative paid amount to equal the approved amount';
    END IF;
  END IF;

  IF p_target_status = 'rejected' AND v_denial_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  UPDATE public.claim_cases c
  SET status = p_target_status,
      approved_amount = v_approved,
      paid_amount = v_paid,
      denial_reason = CASE WHEN p_target_status = 'rejected' THEN v_denial_reason ELSE c.denial_reason END,
      submitted_at = CASE WHEN p_target_status = 'submitted' THEN coalesce(c.submitted_at, now()) ELSE c.submitted_at END,
      approved_at = CASE WHEN p_target_status IN ('approved','partially_approved') THEN coalesce(c.approved_at, now()) ELSE c.approved_at END,
      paid_at = CASE WHEN p_target_status = 'paid' THEN coalesce(c.paid_at, now()) ELSE c.paid_at END,
      closed_at = CASE WHEN p_target_status = 'closed' THEN coalesce(c.closed_at, now()) ELSE c.closed_at END,
      updated_at = now()
  WHERE c.id = p_claim_case_id;

  INSERT INTO public.claim_case_events (
    facility_id, claim_case_id, from_status, to_status, note, actor_id, metadata
  ) VALUES (
    v_case.facility_id, v_case.id, v_case.status, p_target_status, trim(p_note), v_user_id,
    jsonb_build_object(
      'approved_amount', v_approved,
      'paid_amount', v_paid,
      'denial_reason', CASE WHEN p_target_status = 'rejected' THEN v_denial_reason ELSE NULL END
    )
  );

  RETURN QUERY
    SELECT c.id, c.claim_number, c.status
    FROM public.claim_cases c
    WHERE c.id = p_claim_case_id;
END;
$function$;

-- Private mutation helpers perform the authorized writes. They are not exposed
-- through PostgREST, and each helper independently checks auth.uid(), claims.write
-- and facility membership before accessing the protected tables.
REVOKE ALL ON FUNCTION security_internal.create_individual_claim_case(uuid, uuid, text, date, numeric, text, text, text, text, uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION security_internal.transition_individual_claim_case(uuid, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security_internal.create_individual_claim_case(uuid, uuid, text, date, numeric, text, text, text, text, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION security_internal.transition_individual_claim_case(uuid, text, text, numeric, numeric, text) TO authenticated;

-- Exposed RPCs remain SECURITY INVOKER and only delegate to the private helpers.
CREATE OR REPLACE FUNCTION public.create_individual_claim_case(
  p_facility_id uuid,
  p_insurance_company_id uuid,
  p_patient_name text,
  p_date_of_service date,
  p_submitted_amount numeric,
  p_member_number text DEFAULT NULL,
  p_procedure_name text DEFAULT NULL,
  p_diagnosis text DEFAULT NULL,
  p_clinical_notes text DEFAULT NULL,
  p_preauth_id uuid DEFAULT NULL,
  p_service_period_start date DEFAULT NULL,
  p_service_period_end date DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS TABLE (case_id uuid, claim_number text, status text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT * FROM security_internal.create_individual_claim_case(
    p_facility_id, p_insurance_company_id, p_patient_name, p_date_of_service,
    p_submitted_amount, p_member_number, p_procedure_name, p_diagnosis,
    p_clinical_notes, p_preauth_id, p_service_period_start, p_service_period_end,
    p_currency
  );
$wrapper$;

CREATE OR REPLACE FUNCTION public.transition_individual_claim_case(
  p_claim_case_id uuid,
  p_target_status text,
  p_note text,
  p_approved_amount numeric DEFAULT NULL,
  p_paid_amount numeric DEFAULT NULL,
  p_denial_reason text DEFAULT NULL
)
RETURNS TABLE (case_id uuid, claim_number text, status text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $wrapper$
  SELECT * FROM security_internal.transition_individual_claim_case(
    p_claim_case_id, p_target_status, p_note, p_approved_amount, p_paid_amount, p_denial_reason
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.create_individual_claim_case(uuid, uuid, text, date, numeric, text, text, text, text, uuid, date, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_individual_claim_case(uuid, text, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_individual_claim_case(uuid, uuid, text, date, numeric, text, text, text, text, uuid, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_individual_claim_case(uuid, text, text, numeric, numeric, text) TO authenticated;
