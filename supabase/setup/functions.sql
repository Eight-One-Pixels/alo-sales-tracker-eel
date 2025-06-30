-- ENUMS should be created beforehand
-- Assumes: public.user_role enum and all related tables exist

-- Check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role user_role)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$function$;

-- Check if a user is a manager, director, or admin
CREATE OR REPLACE FUNCTION public.is_manager_or_above(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('manager', 'director', 'admin')
  );
$function$;

-- Insert profile and default role when a new user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email
  );
  
  -- Assign default role as 'rep'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'rep');
  
  RETURN new;
END;$function$;

-- Get user's first role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS user_role AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Update goal progress for daily visits
CREATE OR REPLACE FUNCTION public.update_goal_progress()
RETURNS trigger AS $$
BEGIN
  UPDATE public.goals 
  SET current_value = (
    SELECT COUNT(*)::DECIMAL
    FROM public.daily_visits 
    WHERE rep_id = NEW.rep_id 
      AND visit_date BETWEEN goals.period_start AND goals.period_end
  ),
  updated_at = now()
  WHERE user_id = NEW.rep_id 
    AND goal_type = 'visits'
    AND period_start <= NEW.visit_date 
    AND period_end >= NEW.visit_date;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update conversion and revenue goals
CREATE OR REPLACE FUNCTION public.update_conversion_goals()
RETURNS trigger AS $$
BEGIN
  -- Conversion count
  UPDATE public.goals 
  SET current_value = (
    SELECT COUNT(*)::DECIMAL
    FROM public.conversions 
    WHERE rep_id = NEW.rep_id 
      AND conversion_date BETWEEN goals.period_start AND goals.period_end
  ),
  updated_at = now()
  WHERE user_id = NEW.rep_id 
    AND goal_type = 'conversions'
    AND period_start <= NEW.conversion_date 
    AND period_end >= NEW.conversion_date;

  -- Revenue total
  UPDATE public.goals 
  SET current_value = (
    SELECT COALESCE(SUM(revenue_amount), 0)::DECIMAL
    FROM public.conversions 
    WHERE rep_id = NEW.rep_id 
      AND conversion_date BETWEEN goals.period_start AND goals.period_end
      AND (currency = goals.currency OR (currency IS NULL AND goals.currency = 'USD'))
  ),
  updated_at = now()
  WHERE user_id = NEW.rep_id 
    AND goal_type = 'revenue'
    AND period_start <= NEW.conversion_date 
    AND period_end >= NEW.conversion_date;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update lead creation goals
CREATE OR REPLACE FUNCTION public.update_lead_goals()
RETURNS trigger AS $$
BEGIN
  UPDATE public.goals 
  SET current_value = (
    SELECT COUNT(*)::DECIMAL
    FROM public.leads 
    WHERE created_by = NEW.created_by 
      AND created_at::date BETWEEN goals.period_start AND goals.period_end
  ),
  updated_at = now()
  WHERE user_id = NEW.created_by 
    AND goal_type = 'leads'
    AND period_start <= NEW.created_at::date 
    AND period_end >= NEW.created_at::date;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Calculate commission with deductions from active rules
CREATE OR REPLACE FUNCTION public.calculate_commission_with_deductions(
  revenue_amount numeric,
  commission_rate numeric,
  currency text DEFAULT 'USD'::text
)
RETURNS TABLE (
  commissionable_amount numeric,
  total_deductions numeric,
  final_commission numeric,
  deductions_applied jsonb
) AS $$
DECLARE
  deduction RECORD;
  total_deduction_amount DECIMAL := 0;
  deductions_array JSONB := '[]'::jsonb;
  working_amount DECIMAL := revenue_amount;
  deduction_amount DECIMAL;
BEGIN
  FOR deduction IN 
    SELECT d.id, d.label, d.percentage, d.applies_before_commission
    FROM public.deductions d 
    WHERE d.is_active = true
    ORDER BY d.applies_before_commission DESC, d.created_at ASC
  LOOP
    deduction_amount := working_amount * (deduction.percentage / 100);
    total_deduction_amount := total_deduction_amount + deduction_amount;

    deductions_array := deductions_array || jsonb_build_object(
      'id', deduction.id,
      'label', deduction.label,
      'percentage', deduction.percentage,
      'amount', deduction_amount,
      'applies_before_commission', deduction.applies_before_commission
    );

    IF deduction.applies_before_commission THEN
      working_amount := working_amount - deduction_amount;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 
    working_amount,
    total_deduction_amount,
    working_amount * (commission_rate / 100),
    deductions_array;
END;
$$ LANGUAGE plpgsql;

-- Calculate commission with custom deduction JSON
CREATE OR REPLACE FUNCTION public.calculate_commission_with_custom_deductions(
  revenue_amount numeric,
  commission_rate numeric,
  currency text,
  deduction_settings jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE (
  commissionable_amount numeric,
  final_commission numeric,
  deductions_applied jsonb
) AS $$
DECLARE
  deductions jsonb;
  deduction jsonb;
  deductions_applied jsonb := '[]'::jsonb;
  deduction_total numeric := 0;
  commissionable numeric := revenue_amount;
  deduction_amount numeric;
BEGIN
  IF deduction_settings IS NOT NULL THEN
    deductions := deduction_settings;
  ELSE
    SELECT deductions INTO deductions FROM deductions_settings LIMIT 1;
  END IF;

  IF deductions IS NOT NULL THEN
    FOR deduction IN SELECT * FROM jsonb_array_elements(deductions)
    LOOP
      deduction_amount := commissionable * ((deduction->>'percentage')::numeric / 100);
      deductions_applied := deductions_applied || jsonb_build_object(
        'label', deduction->>'label',
        'percentage', deduction->>'percentage',
        'amount', deduction_amount
      );
      commissionable := commissionable - deduction_amount;
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    commissionable,
    commissionable * (commission_rate / 100),
    deductions_applied;
END;
$$ LANGUAGE plpgsql;
