
CREATE OR REPLACE FUNCTION public.get_ultimate_matches()
RETURNS TABLE (first_name TEXT, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, email FROM public.profiles WHERE user_id = auth.uid()
  ),
  my_crushes AS (
    SELECT lower(target_email) AS target FROM public.crushes
    WHERE owner_profile_id = (SELECT id FROM me)
  ),
  their_crushes AS (
    -- profiles whose owners crush on me
    SELECT p.id, p.first_name, p.email
    FROM public.crushes c
    JOIN public.profiles p ON p.id = c.owner_profile_id
    WHERE lower(c.target_email) = (SELECT lower(email) FROM me)
  )
  SELECT tc.first_name, tc.email
  FROM their_crushes tc
  WHERE lower(tc.email) IN (SELECT target FROM my_crushes);
$$;

REVOKE ALL ON FUNCTION public.get_ultimate_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ultimate_matches() TO authenticated;
