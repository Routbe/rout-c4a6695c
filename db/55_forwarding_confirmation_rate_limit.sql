-- 55 — Rate limits voor forwarding-bevestigingsmails. Idempotent.
-- Elke verzonden bevestigingsmail wordt gelogd; de backend weigert boven:
--   3 per 10 minuten per account, 5 per dag per account, 2 per dag per ontvanger.
create table if not exists public.forwarding_confirmation_sends (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  recipient  text not null,
  sent_at    timestamptz not null default now()
);
create index if not exists fwd_conf_sends_user_idx on public.forwarding_confirmation_sends (user_id, sent_at);
create index if not exists fwd_conf_sends_recipient_idx on public.forwarding_confirmation_sends (lower(recipient), sent_at);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, delete on public.forwarding_confirmation_sends to rout_app;
  end if;
end $$;
