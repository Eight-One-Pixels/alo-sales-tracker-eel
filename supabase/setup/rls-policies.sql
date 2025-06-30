ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_source_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors can approve conversions" 
ON conversions 
FOR UPDATE 
TO public 
USING (has_role(auth.uid(), 'director'::user_role) OR has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Managers can recommend conversions" 
ON conversions 
FOR UPDATE 
TO public 
USING (has_role(auth.uid(), 'manager'::user_role) OR has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Managers can view all conversions" 
ON conversions 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Reps can manage their own conversions" 
ON conversions 
FOR ALL 
TO public 
USING (auth.uid() = rep_id);

CREATE POLICY "Admins can update all rows" 
ON conversions 
FOR UPDATE 
TO public 
USING (EXISTS (SELECT 1 FROM user_roles WHERE (user_roles.id = (SELECT profiles_1.role_id FROM profiles profiles_1 WHERE (profiles_1.id = auth.uid()))) AND (user_roles.role = 'admin'::user_role)))
WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE (user_roles.id = (SELECT profiles_1.role_id FROM profiles profiles_1 WHERE (profiles_1.id = auth.uid()))) AND (user_roles.role = 'admin'::user_role)));

CREATE POLICY "Managers can view team profiles" 
ON profiles 
FOR SELECT 
TO public 
USING ((auth.uid() = id) OR is_manager_or_above(auth.uid()));

CREATE POLICY "Users can update their own profile" 
ON profiles 
FOR UPDATE 
TO public 
USING (auth.uid() = id);

CREATE POLICY "Users can view their own profile" 
ON profiles 
FOR SELECT 
TO public 
USING (auth.uid() = id);

CREATE POLICY "delete_own_profile" 
ON profiles 
FOR DELETE 
TO public 
USING (id = auth.uid());

CREATE POLICY "insert_own_profile" 
ON profiles 
FOR INSERT 
TO public 
WITH CHECK (id = auth.uid());

CREATE POLICY "select_own_profile" 
ON profiles 
FOR SELECT 
TO public 
USING (id = auth.uid());

CREATE POLICY "update_own_profile" 
ON profiles 
FOR UPDATE 
TO public 
USING (id = auth.uid());

CREATE POLICY "Admins can manage roles" 
ON user_roles 
FOR ALL 
TO public 
USING (has_role(auth.uid(), 'admin'::user_role));

CREATE POLICY "Managers can view all roles" 
ON user_roles 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Users can view their own roles" 
ON user_roles 
FOR SELECT 
TO public 
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all leads" 
ON leads 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Reps can manage their own leads" 
ON leads 
FOR ALL 
TO public 
USING (auth.uid() = created_by);

CREATE POLICY "Managers can view team goals" 
ON goals 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Users can manage their own goals" 
ON goals 
FOR ALL 
TO public 
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all visits" 
ON daily_visits 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Reps can manage their own visits" 
ON daily_visits 
FOR ALL 
TO public 
USING (auth.uid() = rep_id);

CREATE POLICY "Managers can view all clients" 
ON clients 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Users can manage their own clients" 
ON clients 
FOR ALL 
TO public 
USING (auth.uid() = created_by);

CREATE POLICY "Managers can view all status options" 
ON lead_status_options 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Users can manage their own status options" 
ON lead_status_options 
FOR ALL 
TO public 
USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all source options" 
ON lead_source_options 
FOR SELECT 
TO public 
USING (is_manager_or_above(auth.uid()));

CREATE POLICY "Users can manage their own source options" 
ON lead_source_options 
FOR ALL 
TO public 
USING (auth.uid() = user_id);

CREATE POLICY "Admins and Directors can manage deductions" 
ON deductions 
FOR ALL 
TO public 
USING (EXISTS (SELECT 1 FROM user_roles WHERE (user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['admin'::user_role, 'director'::user_role]))));

CREATE POLICY "All users can view active deductions" 
ON deductions 
FOR SELECT 
TO public 
USING (is_active = true);