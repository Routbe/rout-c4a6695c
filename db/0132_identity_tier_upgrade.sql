-- 0132 — Tier upgrade: a real-human (tier 1) account can later add a legal identity (tier 2).
-- identity_verifications stays immutable (first proof); the legal upgrade lives on verified_identities.
alter table public.verified_identities add column if not exists legal_name text;
alter table public.verified_identities drop constraint if exists verified_identities_legal_name_len;
alter table public.verified_identities add constraint verified_identities_legal_name_len
  check (legal_name is null or char_length(legal_name) <= 160);

-- Backfill: every existing verification gets its tier row (tier 2 only for document providers).
insert into public.verified_identities
  (user_id, identity_nullifier, provider, tier, tier_1_real_human, tier_2_legal_identity,
   national_id_nullifier, provider_sub_nullifier, legal_name, verified_at)
select iv.user_id, iv.unique_human_id, iv.verification_provider::text,
       case when iv.verification_provider::text in ('didit', 'itsme', 'eid') then 'tier_2_legal_identity' else 'tier_1_real_human' end,
       true,
       iv.verification_provider::text in ('didit', 'itsme', 'eid'),
       case when iv.verification_provider::text in ('didit', 'itsme', 'eid') then iv.unique_human_id end,
       case when iv.verification_provider::text = 'w_identity' then iv.unique_human_id end,
       case when iv.verification_provider::text in ('didit', 'itsme', 'eid') then iv.verified_real_name end,
       coalesce(iv.verified_at, now())
  from public.identity_verifications iv
  join public.users u on u.id = iv.user_id
 where iv.is_verified and iv.unique_human_id is not null
   and iv.verification_provider::text in ('didit', 'w_identity', 'itsme', 'eid')
on conflict do nothing;
