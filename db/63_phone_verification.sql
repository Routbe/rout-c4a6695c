-- 63 — Telefoonverificatie (voorbereid; versturen pas actief met SMS-sleutels).
-- Het nummer staat in een aparte tabel (niet in profiles), omdat profiles via de
-- browser-gateway publiek leesbaar is. Alleen versleuteld + laatste 4 cijfers.
create table if not exists public.user_phone_numbers (
  user_id           uuid primary key,
  phone_number_enc  text not null,
  phone_hash        text not null,
  phone_last4       text not null,
  phone_verified    boolean not null default false,
  phone_verified_at timestamptz,
  updated_at        timestamptz not null default now()
);
create index if not exists user_phone_numbers_hash_idx on public.user_phone_numbers (phone_hash);

create table if not exists public.phone_otp_codes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  phone_hash       text not null,
  phone_number_enc text not null,
  phone_last4      text not null,
  code_hash        text not null,
  attempts         int not null default 0,
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists phone_otp_codes_user_idx on public.phone_otp_codes (user_id, created_at desc);

grant select, insert, update, delete on public.user_phone_numbers, public.phone_otp_codes to rout_app;
