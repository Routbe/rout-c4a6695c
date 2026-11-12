-- 0214: contact form triage + attachment columns.
-- These columns already exist on the production Neon database (added by hand
-- earlier) and are written by src/lib/contact.functions.ts. Without this file a
-- fresh database would reject every contact form submission.
-- Idempotent: a no-op where the columns exist.
alter table public.contact_submissions
  add column if not exists portal_category text,
  add column if not exists category text,
  add column if not exists priority text,
  add column if not exists meta jsonb,
  add column if not exists attachment_key text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_mime text;

create index if not exists contact_submissions_category_idx on public.contact_submissions using btree (category);
create index if not exists contact_submissions_priority_idx on public.contact_submissions using btree (priority);
