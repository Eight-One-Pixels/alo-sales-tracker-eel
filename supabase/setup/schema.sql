-- Create Enum Types
CREATE TYPE public.conversion_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.visit_type AS ENUM ('initial', 'follow-up', 'final');
CREATE TYPE public.user_role AS ENUM ('rep', 'manager', 'director', 'admin');

-- Create Tables

-- 1. user_roles (references only auth.users)
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.user_role NOT NULL DEFAULT 'rep'::user_role,
  assigned_by uuid NULL,
  assigned_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_key UNIQUE (user_id),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),
  CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_id ON public.user_roles USING btree (id);

-- 2. profiles (references auth.users and user_roles)
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  sys_role text NULL,
  position text NULL DEFAULT ''::text,
  avatar_url text NULL,
  email text NULL,
  phone text NULL,
  department text NULL,
  manager_id uuid NULL,
  hire_date date NULL DEFAULT CURRENT_DATE,
  is_active boolean NULL DEFAULT true,
  role_id uuid NULL,
  preferred_currency text NULL,
  default_commission_rate numeric NULL,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT fk_role FOREIGN KEY (role_id) REFERENCES user_roles(id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles USING btree (role_id);

-- 3. clients (references auth.users)
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  company_name text NOT NULL,
  contact_person text NULL,
  email text NULL,
  phone text NULL,
  address text NULL,
  industry text NULL,
  notes text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- 4. lead_source_options (references auth.users)
CREATE TABLE public.lead_source_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  is_default boolean NULL DEFAULT false,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT lead_source_options_pkey PRIMARY KEY (id),
  CONSTRAINT lead_source_options_user_id_value_key UNIQUE (user_id, value),
  CONSTRAINT lead_source_options_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 5. lead_status_options (references auth.users)
CREATE TABLE public.lead_status_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  is_default boolean NULL DEFAULT false,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT lead_status_options_pkey PRIMARY KEY (id),
  CONSTRAINT lead_status_options_user_id_value_key UNIQUE (user_id, value),
  CONSTRAINT lead_status_options_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 6. leads (references auth.users and profiles)
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  address text NULL,
  industry text NULL,
  source text NOT NULL,
  status text NULL,
  notes text NULL,
  next_follow_up date NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  currency text NULL DEFAULT 'USD'::text,
  estimated_revenue numeric(12,2) NULL,
  lead_date date NULL DEFAULT CURRENT_DATE,
  CONSTRAINT leads_pkey PRIMARY KEY (id),
  CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT leads_created_by_fkey1 FOREIGN KEY (created_by) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_leads_currency ON public.leads USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_leads_estimated_revenue ON public.leads USING btree (estimated_revenue);

-- 7. goals (references auth.users)
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_type text NOT NULL,
  target_value numeric(10,2) NOT NULL,
  current_value numeric(10,2) NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  description text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  currency text NULL DEFAULT 'USD'::text,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- 8. deductions (references auth.users)
CREATE TABLE public.deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  label text NOT NULL,
  percentage numeric(5,2) NOT NULL,
  applies_before_commission boolean NULL DEFAULT true,
  is_active boolean NULL DEFAULT true,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT deductions_pkey PRIMARY KEY (id),
  CONSTRAINT deductions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT deductions_percentage_check CHECK (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))
);

-- 9. conversions (references leads, auth.users, and profiles)
CREATE TABLE public.conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  rep_id uuid NOT NULL,
  conversion_date date NOT NULL DEFAULT CURRENT_DATE,
  revenue_amount numeric(10,2) NOT NULL,
  commission_rate numeric(5,2) NULL,
  commission_amount numeric(10,2) NULL,
  notes text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  currency text NULL DEFAULT 'USD'::text,
  commissionable_amount numeric(10,2) NULL,
  deductions_applied jsonb NULL DEFAULT '[]'::jsonb,
  status public.conversion_status NULL DEFAULT 'pending'::conversion_status,
  submitted_by uuid NULL,
  submitted_at timestamp with time zone NULL,
  recommended_by uuid NULL,
  recommended_at timestamp with time zone NULL,
  approved_by uuid NULL,
  approved_at timestamp with time zone NULL,
  rejection_reason text NULL,
  workflow_notes text NULL,
  CONSTRAINT conversions_pkey PRIMARY KEY (id),
  CONSTRAINT conversions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id),
  CONSTRAINT conversions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  CONSTRAINT conversions_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES auth.users(id),
  CONSTRAINT conversions_rep_id_fkey1 FOREIGN KEY (rep_id) REFERENCES profiles(id),
  CONSTRAINT conversions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id),
  CONSTRAINT conversions_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_conversions_currency ON public.conversions USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_conversions_status ON public.conversions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_conversions_submitted_by ON public.conversions USING btree (submitted_by);
CREATE INDEX IF NOT EXISTS idx_conversions_recommended_by ON public.conversions USING btree (recommended_by);
CREATE INDEX IF NOT EXISTS idx_conversions_approved_by ON public.conversions USING btree (approved_by);

-- 10. daily_visits (references leads, auth.users, and profiles)
CREATE TABLE public.daily_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  company_name text NOT NULL,
  contact_person text NULL,
  visit_type public.visit_type NOT NULL,
  duration_minutes integer NULL,
  outcome text NULL,
  lead_generated boolean NULL DEFAULT false,
  lead_id uuid NULL,
  follow_up_required boolean NULL DEFAULT false,
  follow_up_date date NULL,
  notes text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  visit_time time without time zone NULL,
  contact_email text NULL,
  status text NULL DEFAULT 'completed'::text,
  CONSTRAINT daily_visits_pkey PRIMARY KEY (id),
  CONSTRAINT daily_visits_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id),
  CONSTRAINT daily_visits_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES auth.users(id),
  CONSTRAINT daily_visits_rep_id_fkey1 FOREIGN KEY (rep_id) REFERENCES profiles(id),
  CONSTRAINT daily_visits_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);
CREATE INDEX IF NOT EXISTS idx_daily_visits_status ON public.daily_visits USING btree (status);
CREATE INDEX IF NOT EXISTS idx_daily_visits_rep_status ON public.daily_visits USING btree (rep_id, status);
