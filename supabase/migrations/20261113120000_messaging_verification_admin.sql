-- =====================================================================
-- NSUMatch: real messaging, real ID verification, role-based admin,
-- and a server-side lock on the verified badge.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Roles (admins). Roles live in their own table — never on profiles —
--    so users can't grant themselves privileges by editing their profile.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies: roles are granted only from the backend
-- (SQL editor / service role). See the note at the bottom of this file.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Verification workflow columns on profiles
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS verification_note TEXT,
  ADD COLUMN IF NOT EXISTS id_card_path TEXT;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IN ('none', 'pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT (verification_status, verification_note, id_card_path)
  ON public.profiles TO authenticated;

-- Backfill. Demo/seed profiles (no user_id) keep their badge.
-- Real users who got `verified = true` came from the old client code that
-- granted the badge on upload (no admin could ever approve: RLS blocked it),
-- so they go back to "pending" review instead of keeping an unearned badge.
UPDATE public.profiles
SET verification_status = CASE
      WHEN user_id IS NULL AND verified THEN 'approved'
      WHEN id_card_uploaded THEN 'pending'
      ELSE 'none'
    END,
    verified = CASE WHEN user_id IS NULL THEN verified ELSE false END;

-- ---------------------------------------------------------------------
-- 3) Lock: only admins can change verified / verification_note.
--    Users may only move their own status to 'pending' after uploading an ID.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_verification()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Backend contexts (signup trigger, SQL editor, service role) have no auth.uid().
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.verification_note := NULL;
    IF NEW.verification_status NOT IN ('none', 'pending') THEN
      NEW.verification_status := 'none';
    END IF;
    RETURN NEW;
  END IF;

  NEW.verified := OLD.verified;
  NEW.verification_note := OLD.verification_note;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NOT (NEW.verification_status = 'pending'
            AND NEW.id_card_path IS NOT NULL
            AND OLD.verification_status IN ('none', 'rejected')) THEN
      NEW.verification_status := OLD.verification_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_protect_verification ON public.profiles;
CREATE TRIGGER profiles_protect_verification
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_verification();

-- Admins can review every profile (incl. not-yet-onboarded) and set verification.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 4) Private bucket for student ID photos (owner + admins only)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('id-cards', 'id-cards', false, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own ID card" ON storage.objects;
CREATE POLICY "Users upload own ID card"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-cards' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner or admin can read ID card" ON storage.objects;
CREATE POLICY "Owner or admin can read ID card"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'id-cards'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Users delete own ID card" ON storage.objects;
CREATE POLICY "Users delete own ID card"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'id-cards' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 5) Messages — only between mutual matches, delivered in real time
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_mutual_match(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  -- Runs under the caller's RLS, so it only "sees" swipes the caller is part of.
  SELECT EXISTS (SELECT 1 FROM public.swipes
                 WHERE from_profile_id = a AND to_profile_id = b AND action IN ('like', 'tea'))
     AND EXISTS (SELECT 1 FROM public.swipes
                 WHERE from_profile_id = b AND to_profile_id = a AND action IN ('like', 'tea'));
$$;
REVOKE ALL ON FUNCTION public.is_mutual_match(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mutual_match(UUID, UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CHECK (from_profile_id <> to_profile_id)
);
CREATE INDEX IF NOT EXISTS messages_from_idx ON public.messages (from_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_to_idx ON public.messages (to_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON public.messages (to_profile_id) WHERE read_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.messages TO authenticated;
-- Column-level grants: clients can't forge created_at/read_at or edit message text.
GRANT INSERT (from_profile_id, to_profile_id, body) ON public.messages TO authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.profile_belongs_to_me(from_profile_id) OR public.profile_belongs_to_me(to_profile_id));

DROP POLICY IF EXISTS "Matches can send messages" ON public.messages;
CREATE POLICY "Matches can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.profile_belongs_to_me(from_profile_id)
    AND public.is_mutual_match(from_profile_id, to_profile_id)
  );

DROP POLICY IF EXISTS "Recipient can mark read" ON public.messages;
CREATE POLICY "Recipient can mark read"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.profile_belongs_to_me(to_profile_id))
  WITH CHECK (public.profile_belongs_to_me(to_profile_id));

-- Realtime delivery (respects RLS).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Making someone an admin (run once in the backend SQL editor, not from the app):
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'admin.name@northsouth.edu';
-- ---------------------------------------------------------------------
