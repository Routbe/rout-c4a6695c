-- Brand protection for handles, aliases and workspace slugs (mirrors src/lib/reserved-brands.ts).
create table public.reserved_brands (
  term text primary key check (term ~ '^[a-z0-9]+$'),
  category text not null check (category in ('platform','brand','public_body','impersonation')),
  reason text not null,
  created_at timestamptz not null default now()
);
grant select on public.reserved_brands to rout_app;
alter table public.reserved_brands enable row level security;
create policy reserved_brands_read on public.reserved_brands for select to rout_app using (true);

-- A release is granted by an admin to one verified owner; never self-service.
create table public.reserved_brand_releases (
  term text not null references public.reserved_brands(term) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  released_by uuid not null references public.users(id),
  evidence text not null check (length(evidence) between 3 and 500),
  created_at timestamptz not null default now(),
  primary key (term, user_id)
);
grant select, insert on public.reserved_brand_releases to rout_app;
alter table public.reserved_brand_releases enable row level security;
create policy reserved_brand_releases_owner on public.reserved_brand_releases for select to rout_app
using (user_id::text = current_setting('rout.user_id', true));

insert into public.reserved_brands (term, category, reason) values
  ('rout','platform','Platformnaam'),('routbe','platform','Platformnaam'),
  ('official','impersonation','Misleidend'),('support','impersonation','Misleidend'),
  ('security','impersonation','Misleidend'),('helpdesk','impersonation','Misleidend'),
  ('google','brand','Beschermd merk'),('apple','brand','Beschermd merk'),('microsoft','brand','Beschermd merk'),
  ('github','brand','Beschermd merk'),('meta','brand','Beschermd merk'),('facebook','brand','Beschermd merk'),
  ('instagram','brand','Beschermd merk'),('whatsapp','brand','Beschermd merk'),('tiktok','brand','Beschermd merk'),
  ('youtube','brand','Beschermd merk'),('linkedin','brand','Beschermd merk'),('twitter','brand','Beschermd merk'),
  ('bluesky','brand','Beschermd merk'),('mastodon','brand','Beschermd merk'),('snapchat','brand','Beschermd merk'),
  ('spotify','brand','Beschermd merk'),('stripe','brand','Beschermd merk'),('paypal','brand','Beschermd merk'),
  ('bunq','brand','Beschermd merk'),('kbc','brand','Beschermd merk'),('belfius','brand','Beschermd merk'),
  ('ing','brand','Beschermd merk'),('bnpparibasfortis','brand','Beschermd merk'),('itsme','brand','Beschermd merk'),
  ('proximus','brand','Beschermd merk'),('telenet','brand','Beschermd merk'),('bpost','brand','Beschermd merk'),
  ('nmbs','brand','Beschermd merk'),
  ('belgium','public_body','Overheid'),('belgie','public_body','Overheid'),('vlaanderen','public_body','Overheid'),
  ('wallonie','public_body','Overheid'),('brussel','public_body','Overheid'),('politie','public_body','Overheid'),
  ('overheid','public_body','Overheid'),('europa','public_body','Overheid');
