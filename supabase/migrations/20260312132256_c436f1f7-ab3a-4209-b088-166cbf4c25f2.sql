
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('superuser', 'admin', 'claims_officer', 'accounts_officer', 'data_entry_officer', 'auditor', 'viewer');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Insurance companies
CREATE TABLE public.insurance_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  contact_person TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_companies ENABLE ROW LEVEL SECURITY;

-- Client companies
CREATE TABLE public.client_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  insurance_company_id UUID REFERENCES public.insurance_companies(id),
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

-- Doctors
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_name TEXT NOT NULL,
  specialty TEXT,
  hospital TEXT,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Procedures
CREATE TABLE public.procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_name TEXT NOT NULL,
  procedure_code TEXT UNIQUE,
  default_tariff NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

-- Patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  phone TEXT,
  membership_number TEXT,
  insurance_company_id UUID REFERENCES public.insurance_companies(id),
  client_company_id UUID REFERENCES public.client_companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Pre-authorizations
CREATE TABLE public.pre_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id),
  doctor_id UUID REFERENCES public.doctors(id),
  procedure_id UUID REFERENCES public.procedures(id),
  diagnosis TEXT,
  procedure_date DATE,
  insurance_company_id UUID REFERENCES public.insurance_companies(id),
  provider_name TEXT,
  provider_address TEXT,
  provider_phone TEXT,
  total_cost NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pre_authorizations ENABLE ROW LEVEL SECURITY;

-- Pre-auth items
CREATE TABLE public.preauth_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID REFERENCES public.pre_authorizations(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE public.preauth_items ENABLE ROW LEVEL SECURITY;

-- Claims
CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preauth_id UUID REFERENCES public.pre_authorizations(id),
  insurance_company_id UUID REFERENCES public.insurance_companies(id) NOT NULL,
  patient_name TEXT,
  procedure_name TEXT,
  claim_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  claim_month INTEGER,
  claim_year INTEGER,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES public.claims(id),
  insurance_company_id UUID REFERENCES public.insurance_companies(id),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Withholding tax
CREATE TABLE public.withholding_tax (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_company_id UUID REFERENCES public.insurance_companies(id) NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  claim_total NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 5.00,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.withholding_tax ENABLE ROW LEVEL SECURITY;

-- System settings
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- has_role function (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: users can read all, update own
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles: authenticated can read
CREATE POLICY "Users can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superusers can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superuser'));

-- All data tables: authenticated can CRUD
CREATE POLICY "Authenticated read insurance_companies" ON public.insurance_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert insurance_companies" ON public.insurance_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update insurance_companies" ON public.insurance_companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete insurance_companies" ON public.insurance_companies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read client_companies" ON public.client_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert client_companies" ON public.client_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update client_companies" ON public.client_companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete client_companies" ON public.client_companies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read doctors" ON public.doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert doctors" ON public.doctors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update doctors" ON public.doctors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete doctors" ON public.doctors FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read procedures" ON public.procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert procedures" ON public.procedures FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update procedures" ON public.procedures FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete procedures" ON public.procedures FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read patients" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update patients" ON public.patients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete patients" ON public.patients FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read pre_authorizations" ON public.pre_authorizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert pre_authorizations" ON public.pre_authorizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update pre_authorizations" ON public.pre_authorizations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete pre_authorizations" ON public.pre_authorizations FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read preauth_items" ON public.preauth_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert preauth_items" ON public.preauth_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update preauth_items" ON public.preauth_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete preauth_items" ON public.preauth_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read claims" ON public.claims FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert claims" ON public.claims FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update claims" ON public.claims FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete claims" ON public.claims FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update payments" ON public.payments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete payments" ON public.payments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read withholding_tax" ON public.withholding_tax FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert withholding_tax" ON public.withholding_tax FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update withholding_tax" ON public.withholding_tax FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete withholding_tax" ON public.withholding_tax FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superusers manage settings" ON public.system_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superuser'));

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
