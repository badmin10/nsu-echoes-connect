
-- Lock down handle_new_user: only the auth trigger should run it.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- Lock down set_updated_at trigger helper.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;

-- Re-declare profile_belongs_to_me as SECURITY INVOKER so it runs under the
-- caller's RLS (no privilege escalation surface) and revoke from anon.
CREATE OR REPLACE FUNCTION public.profile_belongs_to_me(pid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = pid AND user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.profile_belongs_to_me(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profile_belongs_to_me(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_me(UUID) TO authenticated;
