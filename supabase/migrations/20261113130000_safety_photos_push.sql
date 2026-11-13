-- =====================================================================
-- NSUMatch: unmatch / block / report, photo messages, push subscriptions.
-- Requires 20261113120000_messaging_verification_admin.sql.
-- =====================================================================

-- Helper: the caller's profile id.
CREATE OR REPLACE FUNCTION public.my_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.my_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_id() TO authenticated;

-- ---------------------------------------------------------------------
-- 0) Bans (set by admins from the report queue)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
GRANT SELECT (banned) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.i_am_banned()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT banned FROM public.profiles WHERE user_id = auth.uid()), false) $$;
REVOKE ALL ON FUNCTION public.i_am_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_am_banned() TO authenticated;

-- Same lock as before, now also covering `banned` (only admins may change it).
CREATE OR REPLACE FUNCTION public.protect_profile_verification()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.banned := false;
    NEW.verification_note := NULL;
    IF NEW.verification_status NOT IN ('none', 'pending') THEN
      NEW.verification_status := 'none';
    END IF;
    RETURN NEW;
  END IF;

  NEW.verified := OLD.verified;
  NEW.banned := OLD.banned;
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

-- Banned users can't swipe.
DROP POLICY IF EXISTS "Users can create their own swipes" ON public.swipes;
CREATE POLICY "Users can create their own swipes"
  ON public.swipes FOR INSERT TO authenticated
  WITH CHECK (public.profile_belongs_to_me(from_profile_id) AND NOT public.i_am_banned());

-- ---------------------------------------------------------------------
-- 1) Blocks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_profile_id, blocked_profile_id),
  CHECK (blocker_profile_id <> blocked_profile_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON public.blocks (blocked_profile_id);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;

DROP POLICY IF EXISTS "Users see their own blocks" ON public.blocks;
CREATE POLICY "Users see their own blocks"
  ON public.blocks FOR SELECT TO authenticated
  USING (blocker_profile_id = public.my_profile_id());
DROP POLICY IF EXISTS "Users can unblock" ON public.blocks;
CREATE POLICY "Users can unblock"
  ON public.blocks FOR DELETE TO authenticated
  USING (blocker_profile_id = public.my_profile_id());
-- Inserts only go through block_profile() below.

-- True if the caller and `pid` have blocked each other in either direction.
-- SECURITY DEFINER so the blocked person can't read who blocked them,
-- but the check still applies to them.
CREATE OR REPLACE FUNCTION public.is_blocked_with_me(pid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_profile_id = public.my_profile_id() AND b.blocked_profile_id = pid)
       OR (b.blocker_profile_id = pid AND b.blocked_profile_id = public.my_profile_id())
  );
$$;
REVOKE ALL ON FUNCTION public.is_blocked_with_me(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with_me(UUID) TO authenticated;

-- Blocked people disappear from each other's Discover, Chats and profiles.
DROP POLICY IF EXISTS "Authenticated can view onboarded profiles (non-sensitive)" ON public.profiles;
CREATE POLICY "Authenticated can view onboarded profiles (non-sensitive)"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    onboarding_complete = true
    AND user_id <> auth.uid()
    AND NOT banned
    AND NOT public.i_am_banned()
    AND NOT public.is_blocked_with_me(id)
  );

-- Unmatch: turn my like into a pass. The match (and the chat) closes for both.
CREATE OR REPLACE FUNCTION public.unmatch(target UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  DELETE FROM public.swipes WHERE from_profile_id = me AND to_profile_id = target;
  INSERT INTO public.swipes (from_profile_id, to_profile_id, action)
  VALUES (me, target, 'pass')
  ON CONFLICT (from_profile_id, to_profile_id) DO UPDATE SET action = 'pass';
END;
$$;
REVOKE ALL ON FUNCTION public.unmatch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmatch(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_profile(target UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF me = target THEN RAISE EXCEPTION 'You cannot block yourself'; END IF;
  INSERT INTO public.blocks (blocker_profile_id, blocked_profile_id)
  VALUES (me, target) ON CONFLICT DO NOTHING;
  PERFORM public.unmatch(target);
  -- Also drop any crush on them (crushes are by email; resolved server-side).
  DELETE FROM public.crushes c
  USING public.profiles p
  WHERE c.owner_profile_id = me AND p.id = target AND lower(c.target_email) = lower(p.email);
END;
$$;
REVOKE ALL ON FUNCTION public.block_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_profile(UUID) TO authenticated;

-- Blocked people can't message each other even if an old match exists.
DROP POLICY IF EXISTS "Matches can send messages" ON public.messages;
CREATE POLICY "Matches can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.profile_belongs_to_me(from_profile_id)
    AND public.is_mutual_match(from_profile_id, to_profile_id)
    AND NOT public.is_blocked_with_me(to_profile_id)
    AND NOT public.i_am_banned()
  );

-- ---------------------------------------------------------------------
-- 2) Reports (reviewed by admins)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN
    ('fake_profile', 'harassment', 'inappropriate_photos', 'spam_or_scam', 'underage', 'not_nsu', 'other')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (reporter_profile_id <> reported_profile_id)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.reports TO authenticated;
GRANT INSERT (reporter_profile_id, reported_profile_id, reason, details) ON public.reports TO authenticated;
GRANT UPDATE (status, admin_note, resolved_at) ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

DROP POLICY IF EXISTS "Users file reports" ON public.reports;
CREATE POLICY "Users file reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_profile_id = public.my_profile_id());
DROP POLICY IF EXISTS "Reporters and admins read reports" ON public.reports;
CREATE POLICY "Reporters and admins read reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_profile_id = public.my_profile_id() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins resolve reports" ON public.reports;
CREATE POLICY "Admins resolve reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins need to see reported profiles even if blocked/hidden; covered by the
-- existing "Admins can view all profiles" policy. Admins may also read the
-- conversation between reporter and reported user to investigate.
DROP POLICY IF EXISTS "Admins read reported conversations" ON public.messages;
CREATE POLICY "Admins read reported conversations"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE (r.reporter_profile_id = messages.from_profile_id AND r.reported_profile_id = messages.to_profile_id)
         OR (r.reporter_profile_id = messages.to_profile_id AND r.reported_profile_id = messages.from_profile_id)
    )
  );

-- ---------------------------------------------------------------------
-- 3) Photo messages
-- ---------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_check;
DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_content_check CHECK (
    char_length(body) <= 2000
    AND (char_length(btrim(body)) >= 1 OR image_path IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT INSERT (image_path) ON public.messages TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

-- Path layout: <sender auth uid>/<recipient profile id>/<file>
DROP POLICY IF EXISTS "Senders upload chat media" ON storage.objects;
CREATE POLICY "Senders upload chat media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_mutual_match(public.my_profile_id(), ((storage.foldername(name))[2])::uuid)
  );

DROP POLICY IF EXISTS "Participants read chat media" ON storage.objects;
CREATE POLICY "Participants read chat media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = public.my_profile_id()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- ---------------------------------------------------------------------
-- 4) Web push subscriptions (one row per device/browser)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_profile_idx ON public.push_subscriptions (profile_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (profile_id = public.my_profile_id())
  WITH CHECK (profile_id = public.my_profile_id());

-- Save this device's subscription for the signed-in user. A browser endpoint
-- belongs to one device, so if someone else used to be signed in on it,
-- the subscription moves to the current account (they stop getting pushes).
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _endpoint TEXT, _p256dh TEXT, _auth TEXT, _user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _endpoint !~ '^https://' THEN RAISE EXCEPTION 'Invalid endpoint'; END IF;
  INSERT INTO public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  VALUES (me, _endpoint, _p256dh, _auth, left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET profile_id = EXCLUDED.profile_id, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, created_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
