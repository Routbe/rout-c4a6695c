-- Level 2b of the SEPA matcher: inbound transfers with the right amount but a
-- payer name that does not match the account holder. They are never activated
-- automatically; an admin approves or rejects them from /dashboard/admin/sepa.

create table if not exists public.sepa_review_queue (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.verification_payments(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  reason text not null default 'name_mismatch',
  status text not null default 'open',
  reference text,
  amount_cents integer,
  expected_cents integer,
  payer_name text,
  holder_name text,
  match_score numeric(4, 2),
  notes text,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sepa_review_queue_status_idx
  on public.sepa_review_queue (status, created_at desc);
create index if not exists sepa_review_queue_user_idx
  on public.sepa_review_queue (user_id);

-- One open row per payment: a re-sent bank notification must not pile up.
create unique index if not exists sepa_review_queue_open_payment_idx
  on public.sepa_review_queue (payment_id)
  where status = 'open' and payment_id is not null;

comment on column public.sepa_review_queue.status is 'open | approved | rejected';
comment on column public.sepa_review_queue.match_score is
  'Fuzzy payer-name similarity, 0.00–1.00 (see src/lib/sepa-name-match.ts).';
