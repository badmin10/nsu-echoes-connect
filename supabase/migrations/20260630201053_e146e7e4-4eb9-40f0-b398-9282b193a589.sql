
-- 1) Lock down get_ultimate_matches: only authenticated may execute; not anon/public
REVOKE EXECUTE ON FUNCTION public.get_ultimate_matches() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ultimate_matches() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ultimate_matches() TO authenticated;

-- 2) Restrict email column on profiles. Replace blanket SELECT grant with column-level grants
--    excluding email. Owner SELECT (including email) handled by separate policy + grant on email.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, user_id, first_name, age, bio, department, major, photo_url, photos,
  free_slots, location, ghost_from_depts, verified, onboarding_complete,
  id_card_uploaded, created_at, updated_at
) ON public.profiles TO authenticated;
-- Allow owner to read their own email column
GRANT SELECT (email) ON public.profiles TO authenticated;

-- Replace the broad SELECT policy with one that allows full row visibility for owner,
-- and visibility of onboarded profiles for others (email column access still gated by
-- column-level grant + a row policy that withholds email for non-owners via a view).
DROP POLICY IF EXISTS "Authenticated can view onboarded profiles" ON public.profiles;

CREATE POLICY "Owners can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Authenticated can view onboarded profiles (non-sensitive)"
ON public.profiles FOR SELECT TO authenticated
USING (onboarding_complete = true AND user_id <> auth.uid());

-- Revoke email column SELECT for non-owners: enforce via a trigger-like view.
-- Postgres doesn't support per-row column RLS, so we expose email only through the
-- owner-scoped policy by revoking general email SELECT and re-granting via a SECURITY
-- DEFINER function the client can use if needed.
REVOKE SELECT (email) ON public.profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT email FROM public.profiles WHERE user_id = auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- 3) Storage: restrict profile-photos reads to owner OR onboarded profile owner
DROP POLICY IF EXISTS "Authenticated can read profile photos" ON storage.objects;

CREATE POLICY "Authenticated can read visible profile photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.onboarding_complete = true
    )
  )
);
