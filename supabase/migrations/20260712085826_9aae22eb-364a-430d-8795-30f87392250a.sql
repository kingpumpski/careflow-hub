DROP POLICY IF EXISTS "Authenticated insert pre_authorizations" ON public.pre_authorizations;
DROP POLICY IF EXISTS "Authenticated update pre_authorizations" ON public.pre_authorizations;
CREATE POLICY "Authenticated insert pre_authorizations" ON public.pre_authorizations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update pre_authorizations" ON public.pre_authorizations
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.preauth_catalog_items
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_preauth_catalog_items_archived ON public.preauth_catalog_items(archived);

CREATE INDEX IF NOT EXISTS idx_patients_fts ON public.patients
  USING gin (to_tsvector('simple', coalesce(patient_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(membership_number,'')));
CREATE INDEX IF NOT EXISTS idx_doctors_fts ON public.doctors
  USING gin (to_tsvector('simple', coalesce(doctor_name,'') || ' ' || coalesce(specialty,'') || ' ' || coalesce(hospital,'') || ' ' || coalesce(contact,'')));
CREATE INDEX IF NOT EXISTS idx_procedures_fts ON public.procedures
  USING gin (to_tsvector('simple', coalesce(procedure_name,'') || ' ' || coalesce(procedure_code,'') || ' ' || coalesce(category,'')));
CREATE INDEX IF NOT EXISTS idx_diagnosis_fts ON public.diagnosis_codes
  USING gin (to_tsvector('simple', coalesce(code,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'')));
CREATE INDEX IF NOT EXISTS idx_catalog_fts ON public.preauth_catalog_items
  USING gin (to_tsvector('simple', coalesce(item_name,'') || ' ' || coalesce(category,'')));
CREATE INDEX IF NOT EXISTS idx_templates_fts ON public.procedure_templates
  USING gin (to_tsvector('simple', coalesce(template_name,'') || ' ' || coalesce(notes,'')));
CREATE INDEX IF NOT EXISTS idx_insurers_fts ON public.insurance_companies
  USING gin (to_tsvector('simple', coalesce(company_name,'') || ' ' || coalesce(contact_person,'') || ' ' || coalesce(email,'')));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  is_broadcast boolean NOT NULL DEFAULT false,
  thread_key text,
  read_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_recipient ON public.chat_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread ON public.chat_messages(thread_key);
CREATE INDEX IF NOT EXISTS idx_chat_broadcast ON public.chat_messages(is_broadcast, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own or broadcast messages" ON public.chat_messages;
CREATE POLICY "Users read own or broadcast messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (is_broadcast OR sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users send messages as self" ON public.chat_messages;
CREATE POLICY "Users send messages as self" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Recipient can mark read" ON public.chat_messages;
CREATE POLICY "Recipient can mark read" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR is_broadcast)
  WITH CHECK (recipient_id = auth.uid() OR is_broadcast);

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='chat_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
  END IF;
END $$;