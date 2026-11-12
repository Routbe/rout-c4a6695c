-- 0167 — Remove the provider-specific ElevenLabs integration.
-- ROUT is provider-agnostic (Sovereign OS): audio on profiles and workspace
-- hubs is a universal block that stores only an https pointer, never
-- third-party API keys. This drops the sealed-key table and the public voice
-- definer function. Destructive; run manually in the Neon SQL editor as owner.

drop function if exists public.rout_public_workspace_voice(text);
drop table if exists public.workspace_voice_settings;
