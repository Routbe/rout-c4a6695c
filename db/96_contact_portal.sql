-- Contact & support portal: triage results, portal metadata and bug attachments.
-- All columns are nullable/additive; existing rows keep working.

alter table public.contact_submissions
  add column if not exists portal_category text,
  add column if not exists category text,
  add column if not exists priority text,
  add column if not exists meta jsonb,
  add column if not exists attachment_key text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_mime text;

create index if not exists contact_submissions_category_idx
  on public.contact_submissions (category);
create index if not exists contact_submissions_priority_idx
  on public.contact_submissions (priority);
