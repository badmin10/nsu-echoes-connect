
-- profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT 'Student',
  age INT NOT NULL DEFAULT 18 CHECK (age >= 17 AND age <= 60),
  bio TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'SBE' CHECK (department IN ('SBE','ECE','SHSS','SEPS')),
  major TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=800&q=80',
  free_slots TEXT[] NOT NULL DEFAULT '{}',
  location TEXT NOT NULL DEFAULT 'none' CHECK (location IN ('none','cafe','plaza','library')),
  ghost_from_depts TEXT[] NOT NULL DEFAULT '{}',
  verified BOOLEAN NOT NULL DEFAULT false,
  id_card_uploaded BOOLEAN NOT NULL DEFAULT false,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_email_nsu_only CHECK (email ~* '^[^@\s]+@northsouth\.edu$')
);

CREATE INDEX profiles_department_idx ON public.profiles(department);
CREATE INDEX profiles_user_id_idx ON public.profiles(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can browse other onboarded profiles (needed for the discover feed)
CREATE POLICY "Authenticated can view onboarded profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (onboarding_complete = true OR user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a stub profile on signup; also enforces .edu at the auth layer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email !~* '^[^@\s]+@northsouth\.edu$' THEN
    RAISE EXCEPTION 'Only @northsouth.edu emails are allowed on NSUMatch';
  END IF;
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- swipes (likes / passes / teas)
CREATE TABLE public.swipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('like','pass','tea')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_profile_id, to_profile_id)
);

CREATE INDEX swipes_from_idx ON public.swipes(from_profile_id);
CREATE INDEX swipes_to_idx ON public.swipes(to_profile_id);

GRANT SELECT, INSERT, DELETE ON public.swipes TO authenticated;
GRANT ALL ON public.swipes TO service_role;

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

-- Helper: is this profile owned by current user?
CREATE OR REPLACE FUNCTION public.profile_belongs_to_me(pid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = pid AND user_id = auth.uid());
$$;

CREATE POLICY "Users can read swipes they're part of"
  ON public.swipes FOR SELECT
  TO authenticated
  USING (public.profile_belongs_to_me(from_profile_id) OR public.profile_belongs_to_me(to_profile_id));

CREATE POLICY "Users can create their own swipes"
  ON public.swipes FOR INSERT
  TO authenticated
  WITH CHECK (public.profile_belongs_to_me(from_profile_id));

CREATE POLICY "Users can delete their own swipes"
  ON public.swipes FOR DELETE
  TO authenticated
  USING (public.profile_belongs_to_me(from_profile_id));

-- crush list (private, anonymous)
CREATE TABLE public.crushes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_profile_id, target_email),
  CONSTRAINT crush_email_nsu CHECK (target_email ~* '^[^@\s]+@northsouth\.edu$')
);

GRANT SELECT, INSERT, DELETE ON public.crushes TO authenticated;
GRANT ALL ON public.crushes TO service_role;
ALTER TABLE public.crushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own crushes"
  ON public.crushes FOR ALL
  TO authenticated
  USING (public.profile_belongs_to_me(owner_profile_id))
  WITH CHECK (public.profile_belongs_to_me(owner_profile_id));

-- Seed a few demo profiles so brand-new accounts have something to swipe on
INSERT INTO public.profiles
  (email, first_name, age, bio, department, major, photo_url, free_slots, location, verified, onboarding_complete)
VALUES
  ('ayesha.k@northsouth.edu','Ayesha',21,'Chai > Coffee. Looking for a thesis-survivor partner.','SBE','Marketing','https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80','{"ST 09:40 AM","MW 01:10 PM","R 11:20 AM"}','cafe',true,true),
  ('rafi.h@northsouth.edu','Rafi',22,'CSE senior. I debug feelings too.','ECE','Computer Science','https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=800&q=80','{"MW 02:40 PM","ST 11:20 AM"}','library',true,true),
  ('nabila.r@northsouth.edu','Nabila',20,'English Lit. Will judge your bookshelf.','SHSS','English','https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80','{"R 01:10 PM","ST 09:40 AM"}','plaza',true,true),
  ('tahmid.a@northsouth.edu','Tahmid',23,'Econ + cricket + dhaba food. In that order.','SBE','Economics','https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&q=80','{"MW 11:20 AM","R 02:40 PM"}','cafe',true,true),
  ('samira.j@northsouth.edu','Samira',21,'Public Health. Will remind you to drink water.','SEPS','Public Health','https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80','{"ST 01:10 PM"}','none',true,true),
  ('imran.s@northsouth.edu','Imran',22,'EEE. Capacitors and conversations.','ECE','Electrical Engineering','https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80','{"MW 01:10 PM","R 11:20 AM"}','library',true,true);
