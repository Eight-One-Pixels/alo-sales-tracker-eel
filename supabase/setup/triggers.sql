CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_goal_progress_trigger
AFTER INSERT OR UPDATE ON public.daily_visits
FOR EACH ROW
EXECUTE FUNCTION public.update_goal_progress();

CREATE TRIGGER update_conversion_goals_trigger
AFTER INSERT OR UPDATE ON public.conversions
FOR EACH ROW
EXECUTE FUNCTION public.update_conversion_goals();

CREATE TRIGGER update_lead_goals_trigger
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_lead_goals();