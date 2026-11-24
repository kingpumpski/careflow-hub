-- Claims officers need to record insurer payment advice for the claims
-- department without receiving broad payments.write or ledger.write authority.
INSERT INTO public.app_permissions (key, label, category, description)
VALUES
  (
    'claims.settlement.read',
    'View claim settlement advice',
    'Claims',
    'View insurer payment advice, approved claim amounts and confirmed WHT for claims reconciliation.'
  ),
  (
    'claims.settlement.write',
    'Record claim settlement advice',
    'Claims',
    'Create and update claim settlement periods and record actual payment-advice figures without granting general payment or ledger write access.'
  )
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('superuser', 'claims.settlement.read'),
  ('superuser', 'claims.settlement.write'),
  ('admin', 'claims.settlement.read'),
  ('admin', 'claims.settlement.write'),
  ('claims_officer', 'claims.settlement.read'),
  ('claims_officer', 'claims.settlement.write')
ON CONFLICT (role, permission_key) DO NOTHING;

-- The existing claims_settlement_periods RLS policies already restrict rows
-- to facility members and permit claims_officer writes. These scoped permissions
-- additionally gate the client workflows; they do not grant general payment or
-- ledger write privileges.
