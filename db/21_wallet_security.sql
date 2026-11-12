-- 21. SecureShield wallet: rechten, RLS, updated_at-trigger en atomaire mutaties.
--
-- Neon/Postgres: de app draait als één databaserol, maar we zetten per request
-- `app.current_user_id` zodat RLS ook daar de rijen afschermt. Alle
-- saldomutaties lopen via SECURITY DEFINER-functies die grootboek en saldo in
-- één transactie bijwerken — zo is dubbel boeken of saldomanipulatie
-- onmogelijk.

-- 1. Rechten -----------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on public.wallets to authenticated';
    execute 'grant select on public.wallet_transactions to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.wallets to service_role';
    execute 'grant all on public.wallet_transactions to service_role';
  end if;
end $$;

-- 2. Row Level Security ------------------------------------------------------
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists wallets_owner_select on public.wallets;
create policy wallets_owner_select on public.wallets
  for select using (user_id = public.current_app_user_id());

drop policy if exists wallets_owner_update on public.wallets;
create policy wallets_owner_update on public.wallets
  for update using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

drop policy if exists wallets_owner_insert on public.wallets;
create policy wallets_owner_insert on public.wallets
  for insert with check (user_id = public.current_app_user_id());

drop policy if exists wallet_tx_owner_select on public.wallet_transactions;
create policy wallet_tx_owner_select on public.wallet_transactions
  for select using (user_id = public.current_app_user_id());

-- Schrijven naar het grootboek gebeurt uitsluitend via de functies hieronder.

-- 3. updated_at-trigger ------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists wallets_touch_updated_at on public.wallets;
create trigger wallets_touch_updated_at
  before update on public.wallets
  for each row execute function public.touch_updated_at();

-- 4. Atomaire saldomutaties --------------------------------------------------
create or replace function public.wallet_credit(
  _user_id uuid,
  _amount_cents integer,
  _kind text default 'topup',
  _description text default null,
  _reference text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _balance integer;
begin
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'wallet_credit: amount must be positive';
  end if;
  if _kind not in ('topup', 'refund', 'adjustment') then
    raise exception 'wallet_credit: invalid kind %', _kind;
  end if;

  insert into public.wallets (user_id) values (_user_id)
  on conflict (user_id) do nothing;

  -- Rijvergrendeling: parallelle webhooks wachten netjes op elkaar.
  select balance_cents into _balance
    from public.wallets where user_id = _user_id for update;

  begin
    insert into public.wallet_transactions
      (user_id, kind, amount_cents, description, reference)
    values (_user_id, _kind, _amount_cents, _description, _reference);
  exception when unique_violation then
    -- Zelfde Stripe-referentie: al geboekt, saldo ongewijzigd.
    return _balance;
  end;

  update public.wallets
     set balance_cents = balance_cents + _amount_cents
   where user_id = _user_id
   returning balance_cents into _balance;

  return _balance;
end $$;

create or replace function public.wallet_debit(
  _user_id uuid,
  _amount_cents integer,
  _description text default null,
  _reference text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _balance integer;
begin
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'wallet_debit: amount must be positive';
  end if;

  insert into public.wallets (user_id) values (_user_id)
  on conflict (user_id) do nothing;

  select balance_cents into _balance
    from public.wallets where user_id = _user_id for update;

  if _balance is null or _balance < _amount_cents then
    return -1; -- onvoldoende saldo; niets geboekt
  end if;

  begin
    insert into public.wallet_transactions
      (user_id, kind, amount_cents, description, reference)
    values (_user_id, 'relay_fee', -_amount_cents, _description, _reference);
  exception when unique_violation then
    return _balance; -- deze periode al afgeschreven
  end;

  update public.wallets
     set balance_cents = balance_cents - _amount_cents
   where user_id = _user_id
   returning balance_cents into _balance;

  return _balance;
end $$;

-- Saldo mag nooit negatief worden, ook niet bij handmatige queries.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wallets_balance_non_negative'
  ) then
    alter table public.wallets
      add constraint wallets_balance_non_negative check (balance_cents >= 0);
  end if;
end $$;
