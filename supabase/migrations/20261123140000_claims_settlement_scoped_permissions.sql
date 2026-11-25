-- Schema-aware permission seed for canonical and legacy deployed RBAC layouts.
DO $seed$
DECLARE v_catalog_key text; v_has_category boolean; v_has_role_granted boolean;
BEGIN
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='key') THEN 'key'
  WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='permission_key') THEN 'permission_key'
  ELSE NULL END INTO v_catalog_key;
 IF v_catalog_key IS NULL THEN RAISE EXCEPTION 'Unsupported app_permissions schema'; END IF;
 v_has_category:=EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_permissions' AND column_name='category');
 v_has_role_granted:=EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='granted');
 IF v_has_category THEN
  EXECUTE format('INSERT INTO public.app_permissions (%I,label,category,description) VALUES ($1,$2,$3,$4),($5,$6,$3,$7) ON CONFLICT (%I) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description',v_catalog_key,v_catalog_key)
  USING 'claims.settlement.read','View claim settlement advice','Claims','View insurer payment advice, approved claim amounts and confirmed WHT for claims reconciliation.','claims.settlement.write','Record claim settlement advice','Create and update claim settlement periods and record actual payment-advice figures without granting general payment or ledger write access.';
 ELSE
  EXECUTE format('INSERT INTO public.app_permissions (%I,label,description) VALUES ($1,$2,$3),($4,$5,$6) ON CONFLICT (%I) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description',v_catalog_key,v_catalog_key)
  USING 'claims.settlement.read','View claim settlement advice','View insurer payment advice, approved claim amounts and confirmed WHT for claims reconciliation.','claims.settlement.write','Record claim settlement advice','Create and update claim settlement periods and record actual payment-advice figures without granting general payment or ledger write access.';
 END IF;
 IF v_has_role_granted THEN
  INSERT INTO public.role_permissions(role,permission_key,granted) VALUES
   ('superuser','claims.settlement.read',true),('superuser','claims.settlement.write',true),('admin','claims.settlement.read',true),('admin','claims.settlement.write',true),('claims_officer','claims.settlement.read',true),('claims_officer','claims.settlement.write',true)
  ON CONFLICT(role,permission_key) DO UPDATE SET granted=EXCLUDED.granted;
 ELSE
  INSERT INTO public.role_permissions(role,permission_key) VALUES
   ('superuser','claims.settlement.read'),('superuser','claims.settlement.write'),('admin','claims.settlement.read'),('admin','claims.settlement.write'),('claims_officer','claims.settlement.read'),('claims_officer','claims.settlement.write')
  ON CONFLICT(role,permission_key) DO NOTHING;
 END IF;
END;
$seed$;
