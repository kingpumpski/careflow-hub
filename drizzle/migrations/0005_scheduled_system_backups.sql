CREATE TABLE public.backup_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  interval_hours integer NOT NULL DEFAULT 24 CHECK (interval_hours IN (6, 12, 24, 72, 168)),
  retention_count integer NOT NULL DEFAULT 14 CHECK (retention_count BETWEEN 1 AND 90),
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view backup settings" ON public.backup_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins update backup settings" ON public.backup_settings FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
INSERT INTO public.backup_settings (id, next_run_at) VALUES (1, now()) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.backup_settings_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  IF NEW.interval_hours IS DISTINCT FROM OLD.interval_hours OR (NEW.enabled AND NOT OLD.enabled) THEN
    NEW.next_run_at := COALESCE(NEW.last_run_at, now()) + make_interval(hours => NEW.interval_hours);
    IF NEW.next_run_at < now() THEN NEW.next_run_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER backup_settings_touch BEFORE UPDATE ON public.backup_settings FOR EACH ROW EXECUTE FUNCTION public.backup_settings_touch();

CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  trigger_type text NOT NULL DEFAULT 'scheduled' CHECK (trigger_type IN ('scheduled', 'manual')),
  requested_by uuid,
  file_path text,
  file_bytes bigint,
  sha256 text,
  format_version text,
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text
);
CREATE INDEX backup_runs_created_at_idx ON public.backup_runs (created_at DESC);
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view backup history" ON public.backup_runs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins read system backup files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'system-backups' AND public.is_admin(auth.uid()));