ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.profiles ADD CONSTRAINT photos_count_check CHECK (cardinality(photos) <= 6);