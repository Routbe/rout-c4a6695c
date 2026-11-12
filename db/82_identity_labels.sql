-- Leesbare naam (e-mail of gebruikersnaam) per gekoppelde Better Auth-identiteit.
-- Wordt lui gevuld bij het tonen van "Gekoppelde identiteiten", ook voor bestaande koppelingen.
create table if not exists public.identity_labels (
  account_id text primary key,
  provider text not null,
  label text not null,
  updated_at timestamptz not null default now()
);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    grant select, insert, update, delete on public.identity_labels to rout_app;
  end if;
end $$;
