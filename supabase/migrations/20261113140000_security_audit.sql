-- Additive audit fixes. Apply after the existing migrations; do not edit history.
BEGIN;

-- RLS filters rows, not individual columns. Private review data needs its own
-- owner/admin-scoped RPC, even when the public profile row is visible.
REVOKE SELECT (id_card_path, verification_note) ON public.profiles FROM authenticated;
CREATE OR REPLACE FUNCTION public.get_profile_verification(target UUID)
RETURNS TABLE (id_card_path TEXT, verification_note TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id_card_path, p.verification_note FROM public.profiles p
  WHERE p.id = target
    AND (p.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$$;
REVOKE ALL ON FUNCTION public.get_profile_verification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_verification(UUID) TO authenticated;

-- A client must not change account ownership/email or delete/recreate its
-- profile to clear a ban. Signup creates the row using the existing trigger.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, age, bio, department, major, photo_url, photos,
  free_slots, location, ghost_from_depts, onboarding_complete,
  id_card_uploaded, id_card_path, verification_status, verification_note,
  verified, banned) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_profile_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.banned := false;
    NEW.verification_note := NULL;
    NEW.verification_status := 'none';
  ELSE
    NEW.verified := OLD.verified;
    NEW.banned := OLD.banned;
    NEW.verification_note := OLD.verification_note;
    -- An approved/pending document cannot be swapped after review/submission.
    IF OLD.verification_status IN ('pending', 'approved') THEN
      NEW.id_card_path := OLD.id_card_path;
      NEW.id_card_uploaded := OLD.id_card_uploaded;
      NEW.verification_status := OLD.verification_status;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.id_card_path IS NOT NULL THEN
    IF split_part(NEW.id_card_path, '/', 1) <> auth.uid()::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
                      WHERE o.bucket_id = 'id-cards' AND o.name = NEW.id_card_path) THEN
      RAISE EXCEPTION 'Upload your own ID photo before submitting';
    END IF;
  END IF;
  NEW.id_card_uploaded := NEW.id_card_path IS NOT NULL;
  IF TG_OP = 'UPDATE' AND NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT (NEW.verification_status = 'pending' AND NEW.id_card_uploaded
              AND OLD.verification_status IN ('none', 'rejected')) THEN
    NEW.verification_status := OLD.verification_status;
  END IF;
  RETURN NEW;
END;
$$;

-- Enforce both sides of Ghost Mode in the database, including direct API reads.
-- Definer helper avoids recursively invoking the profiles SELECT policy.
CREATE OR REPLACE FUNCTION public.can_discover_profile(target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles viewer, public.profiles other
    WHERE viewer.user_id = auth.uid() AND other.id = target
      AND other.user_id <> auth.uid() AND other.onboarding_complete
      AND NOT viewer.banned AND NOT other.banned
      AND NOT (other.department = ANY(viewer.ghost_from_depts))
      AND NOT (viewer.department = ANY(other.ghost_from_depts))
      AND NOT public.is_blocked_with_me(other.id)
  );
$$;
REVOKE ALL ON FUNCTION public.can_discover_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_discover_profile(UUID) TO authenticated;
DROP POLICY IF EXISTS "Authenticated can view onboarded profiles (non-sensitive)" ON public.profiles;
CREATE POLICY "Authenticated can view onboarded profiles (non-sensitive)"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.can_discover_profile(id));

CREATE OR REPLACE FUNCTION public.is_mutual_match(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a <> b AND public.my_profile_id() IN (a, b)
    AND NOT public.i_am_banned()
    AND NOT public.is_blocked_with_me(CASE WHEN a = public.my_profile_id() THEN b ELSE a END)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = a AND NOT banned)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = b AND NOT banned)
    AND EXISTS (SELECT 1 FROM public.swipes WHERE from_profile_id = a AND to_profile_id = b AND action IN ('like', 'tea'))
    AND EXISTS (SELECT 1 FROM public.swipes WHERE from_profile_id = b AND to_profile_id = a AND action IN ('like', 'tea'));
$$;

DROP POLICY IF EXISTS "Users can create their own swipes" ON public.swipes;
CREATE POLICY "Users can create their own swipes" ON public.swipes FOR INSERT TO authenticated
  WITH CHECK (public.profile_belongs_to_me(from_profile_id)
    AND public.can_discover_profile(to_profile_id));

CREATE OR REPLACE FUNCTION public.get_ultimate_matches()
RETURNS TABLE (first_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT other.first_name, other.email
  FROM public.profiles me
  JOIN public.crushes mine ON mine.owner_profile_id = me.id
  JOIN public.profiles other ON lower(other.email) = lower(mine.target_email)
  JOIN public.crushes theirs ON theirs.owner_profile_id = other.id AND lower(theirs.target_email) = lower(me.email)
  WHERE me.user_id = auth.uid() AND public.can_discover_profile(other.id);
$$;

-- Supabase may have table-level default grants. Explicitly remove them before
-- restoring column grants, otherwise INSERT/UPDATE column restrictions do nothing.
REVOKE ALL ON public.messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM authenticated;
GRANT INSERT (from_profile_id, to_profile_id, body, image_path) ON public.messages TO authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
REVOKE ALL ON public.reports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reports FROM authenticated;
GRANT INSERT (reporter_profile_id, reported_profile_id, reason, details) ON public.reports TO authenticated;
GRANT UPDATE (status, admin_note, resolved_at) ON public.reports TO authenticated;

-- An image reference must belong to this sender and this conversation.
CREATE OR REPLACE FUNCTION public.validate_message_image()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.image_path IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF split_part(NEW.image_path, '/', 1) <> auth.uid()::text
       OR split_part(NEW.image_path, '/', 2) <> NEW.to_profile_id::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-media' AND name = NEW.image_path) THEN
      RAISE EXCEPTION 'Invalid conversation photo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_message_image() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER messages_validate_image BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_image();

DROP POLICY IF EXISTS "Senders upload chat media" ON storage.objects;
CREATE POLICY "Senders upload chat media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.is_mutual_match(public.my_profile_id(), ((storage.foldername(name))[2])::uuid));

-- Only the checked RPC may register destinations. Reject local/private hosts,
-- credentials, custom ports and lookalike domains before any server fetch.
REVOKE INSERT, UPDATE ON public.push_subscriptions FROM authenticated;
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _endpoint TEXT, _p256dh TEXT, _auth TEXT, _user_agent TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me UUID := public.my_profile_id();
BEGIN
  IF me IS NULL OR public.i_am_banned() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _endpoint IS NULL OR char_length(_endpoint) > 2048 OR _endpoint !~
    '^https://(fcm\.googleapis\.com/fcm/send/[^?#]+|updates\.push\.services\.mozilla\.com/wpush/v2/[^?#]+|([a-z0-9-]+\.)*push\.apple\.com/[^#]*|([a-z0-9-]+\.)*wns\.windows\.com/[^#]*)$'
    THEN RAISE EXCEPTION 'Unsupported push endpoint'; END IF;
  IF _p256dh IS NULL OR _p256dh !~ '^[A-Za-z0-9_-]{87}=?$'
     OR _auth IS NULL OR _auth !~ '^[A-Za-z0-9_-]{22}(==)?$'
    THEN RAISE EXCEPTION 'Invalid push keys'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(me::text, 1));
  IF (SELECT count(*) FROM public.push_subscriptions WHERE profile_id = me AND endpoint <> _endpoint) >= 10
    THEN RAISE EXCEPTION 'Device limit reached'; END IF;
  INSERT INTO public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  VALUES (me, _endpoint, _p256dh, _auth, left(_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE SET profile_id = EXCLUDED.profile_id,
    p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent, created_at = now();
END;
$$;

-- Atomically claim each event once before delivering notifications. Time-window
-- checks alone allow the same recent event to be replayed thousands of times.
CREATE TABLE public.push_deliveries (
  event_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_deliveries TO service_role;

-- Typing indicators carry conversation activity and must not use public topics.
CREATE OR REPLACE FUNCTION public.can_access_dm_topic(topic TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN topic ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'
    AND split_part(topic, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(topic, ':', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_mutual_match(split_part(topic, ':', 2)::uuid, split_part(topic, ':', 3)::uuid)
    ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.can_access_dm_topic(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_dm_topic(TEXT) TO authenticated;
CREATE POLICY "Matches receive private typing" ON realtime.messages FOR SELECT TO authenticated
  USING (extension = 'broadcast' AND public.can_access_dm_topic((SELECT realtime.topic())));
CREATE POLICY "Matches send private typing" ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (extension = 'broadcast' AND public.can_access_dm_topic((SELECT realtime.topic())));

-- Persist object paths instead of year-long bearer URLs. The UI resolves paths
-- to renewable five-minute URLs under the current viewer's storage permissions.
UPDATE storage.buckets SET public = false, file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  WHERE id = 'profile-photos';
UPDATE public.profiles SET
  photo_url = regexp_replace(photo_url,
    '^https://[^/]+/storage/v1/object/sign/profile-photos/([^?]+)(\?.*)?$', '\1'),
  photos = ARRAY(SELECT regexp_replace(photo,
    '^https://[^/]+/storage/v1/object/sign/profile-photos/([^?]+)(\?.*)?$', '\1')
    FROM unnest(photos) AS photo)
WHERE photo_url LIKE '%/storage/v1/object/sign/profile-photos/%'
   OR EXISTS (SELECT 1 FROM unnest(photos) AS photo WHERE photo LIKE '%/storage/v1/object/sign/profile-photos/%');

COMMIT;
