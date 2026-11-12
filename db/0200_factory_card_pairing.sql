-- SOURCE ONLY: database owner must review and apply after 0199.
-- Factory imports public keys and SHA-256 activation-code hashes, never private
-- keys. Deliver the secret activation code separately from the public NDEF tag.
create table public.factory_card_inventory (
  hardware_id uuid primary key,
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{40,200}$'),
  key_alg text not null check (key_alg in ('Ed25519', 'P-256')),
  activation_hash text not null check (activation_hash ~ '^[0-9a-f]{64}$'),
  nfc_uid text unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  user_id uuid references public.users(id) on delete cascade,
  issued_at timestamptz not null default now(),
  paired_at timestamptz
);
-- Only the narrowly scoped pairing function can reach the factory inventory.
revoke all on public.factory_card_inventory from public, rout_app;
alter table public.factory_card_inventory enable row level security;

create or replace function public.rout_pair_factory_card(hid uuid, proof_hash text, serial text)
returns uuid language plpgsql volatile security definer set search_path = public
as $$
declare uid uuid := public.rout_current_user_id();
declare item public.factory_card_inventory%rowtype;
begin
  if uid is null then return null; end if;
  select * into item from public.factory_card_inventory
    where hardware_id = hid and activation_hash = proof_hash
      and status = 'pending' and user_id is null for update;
  if not found then return null; end if;
  -- Key and algorithm come exclusively from factory inventory, not the client.
  insert into public.physical_keys
    (hardware_id, user_id, card_serial, nfc_uid, public_key, key_alg, status)
    values (item.hardware_id, uid, serial, item.nfc_uid, item.public_key, item.key_alg, 'active');
  update public.factory_card_inventory set status = 'active', user_id = uid,
    paired_at = now(), activation_hash = repeat('0', 64) where hardware_id = hid;
  return hid;
end $$;
revoke all on function public.rout_pair_factory_card(uuid, text, text) from public;
grant execute on function public.rout_pair_factory_card(uuid, text, text) to rout_app;

-- Consumers cannot substitute arbitrary keys through the former registration
-- endpoint or directly mutate key material after production.
revoke insert on public.physical_keys from rout_app;
revoke update (public_key, key_alg) on public.physical_keys from rout_app;