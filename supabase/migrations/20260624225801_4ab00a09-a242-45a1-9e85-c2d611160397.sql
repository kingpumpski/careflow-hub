ALTER TABLE public.preauth_email_log ALTER COLUMN preauth_id DROP NOT NULL;
ALTER TABLE public.preauth_email_log ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;