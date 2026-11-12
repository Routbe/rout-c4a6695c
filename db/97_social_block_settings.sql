CREATE TABLE IF NOT EXISTS public.social_block_settings (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text NOT NULL,
  show_followers boolean NOT NULL DEFAULT false,
  PRIMARY KEY (profile_id, platform, handle)
);
