-- Enforce the dedicated claims settlement permissions at the database boundary.
-- Accounts staff retain access through payments.read/write; claims officers receive
-- only the scoped claims.settlement.read/write capability.
DROP POLICY IF EXISTS claims_settlement_period_select ON public.claims_settlement_periods;
CREATE POLICY claims_settlement_period_select
  ON public.claims_settlement_periods
  FOR SELECT TO authenticated
  USING (
    public.user_has_facility_access(facility_id)
    AND (
      public.current_user_has_permission('payments.read')
      OR public.current_user_has_permission('claims.settlement.read')
    )
  );

DROP POLICY IF EXISTS claims_settlement_period_insert ON public.claims_settlement_periods;
CREATE POLICY claims_settlement_period_insert
  ON public.claims_settlement_periods
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_facility_access(facility_id)
    AND created_by = (SELECT auth.uid())
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]
    )
    AND (
      public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')
    )
  );

DROP POLICY IF EXISTS claims_settlement_period_update ON public.claims_settlement_periods;
CREATE POLICY claims_settlement_period_update
  ON public.claims_settlement_periods
  FOR UPDATE TO authenticated
  USING (
    public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]
    )
    AND (
      public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')
    )
  )
  WITH CHECK (
    public.user_has_facility_access(facility_id)
    AND public.current_user_has_any_role(
      ARRAY['superuser','admin','claims_officer','accounts_officer']::public.app_role[]
    )
    AND (
      public.current_user_has_permission('payments.write')
      OR public.current_user_has_permission('claims.settlement.write')
    )
  );
