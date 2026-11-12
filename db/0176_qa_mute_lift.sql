-- 0176 — Lifting shadow mutes without ever revealing who is muted. Idempotent.
--
-- * Every press of "Demp deze afzender" becomes one mute action. The list a
--   recipient sees is their own actions (time + the message they muted), never
--   a list of senders: two actions that happen to hit the same sender stay two
--   entries, so the list cannot be used to link messages to one person.
-- * The account/device rows in shadow_mutes hang off an action and disappear
--   with it. A sender stays muted while any remaining action still covers them.
-- * Lifting returns the one message that was muted to the inbox; messages that
--   arrived while muted stay quarantined (releasing them would group them).
-- * A recipient can cost a given sender trust points only once, ever: muting,
--   lifting and muting again never drains a sender's score twice.
-- * The runtime role touches mutes only through the functions below.

-- 1. Mute actions (the recipient's own list).
create table if not exists public.qa_mute_actions (
  id                 uuid primary key default gen_random_uuid(),
  recipient_id       uuid not null references public.users (id) on delete cascade,
  source_question_id uuid references public.profile_questions (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists qa_mute_actions_recipient_idx on public.qa_mute_actions (recipient_id, created_at desc);
create unique index if not exists qa_mute_actions_source_key
  on public.qa_mute_actions (recipient_id, source_question_id) where source_question_id is not null;
alter table public.qa_mute_actions enable row level security;
-- No grants and no policies: only the security-definer functions below touch it.

-- 2. Hang every shadow mute off an action (existing rows: one action per batch).
alter table public.shadow_mutes add column if not exists action_id uuid references public.qa_mute_actions (id) on delete cascade;
do $$
declare r record; v uuid;
begin
  for r in select recipient_id, created_at from public.shadow_mutes where action_id is null group by recipient_id, created_at loop
    insert into public.qa_mute_actions (recipient_id, created_at) values (r.recipient_id, r.created_at) returning id into v;
    update public.shadow_mutes set action_id = v
     where recipient_id = r.recipient_id and created_at = r.created_at and action_id is null;
  end loop;
end $$;
alter table public.shadow_mutes alter column action_id set not null;

alter table public.shadow_mutes drop constraint if exists shadow_mutes_recipient_sender_key;
drop index if exists public.shadow_mutes_recipient_device_key;
create unique index if not exists shadow_mutes_action_account on public.shadow_mutes (action_id, muted_sender_id) where muted_sender_id is not null;
create unique index if not exists shadow_mutes_action_device on public.shadow_mutes (action_id, muted_sender_key) where muted_sender_key is not null;
create index if not exists shadow_mutes_recipient_account_idx on public.shadow_mutes (recipient_id, muted_sender_id) where muted_sender_id is not null;
create index if not exists shadow_mutes_recipient_device_idx on public.shadow_mutes (recipient_id, muted_sender_key) where muted_sender_key is not null;

-- 3. Trust charges: one per (recipient, sender identity), ever.
create table if not exists public.qa_trust_charges (
  id             bigint generated always as identity primary key,
  recipient_id   uuid not null references public.users (id) on delete cascade,
  sender_user_id uuid references public.users (id) on delete cascade,
  sender_key     text check (sender_key is null or sender_key ~ '^[0-9a-f]{64}$'),
  charged_at     timestamptz not null default now(),
  constraint qa_trust_charges_one_sender check (num_nonnulls(sender_user_id, sender_key) = 1)
);
create unique index if not exists qa_trust_charges_account on public.qa_trust_charges (recipient_id, sender_user_id) where sender_user_id is not null;
create unique index if not exists qa_trust_charges_device on public.qa_trust_charges (recipient_id, sender_key) where sender_key is not null;
alter table public.qa_trust_charges enable row level security;
-- No grants and no policies.

insert into public.qa_trust_charges (recipient_id, sender_user_id)
select distinct recipient_id, muted_sender_id from public.shadow_mutes where muted_sender_id is not null
on conflict (recipient_id, sender_user_id) where sender_user_id is not null do nothing;
insert into public.qa_trust_charges (recipient_id, sender_key)
select distinct recipient_id, muted_sender_key from public.shadow_mutes where muted_sender_key is not null
on conflict (recipient_id, sender_key) where sender_key is not null do nothing;

create or replace function public.rout_shadow_mute_trust()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_score integer;
  v_new integer;
  v_start timestamptz := now() + make_interval(mins => 720 + floor(random() * 2161)::int);
begin
  if new.muted_sender_id is not null then
    insert into public.qa_trust_charges (recipient_id, sender_user_id) values (new.recipient_id, new.muted_sender_id)
    on conflict (recipient_id, sender_user_id) where sender_user_id is not null do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then return new; end if;
    update public.users u
       set trust_score = greatest(0, u.trust_score - 20)
     where u.id = new.muted_sender_id
     returning u.trust_score into v_score;
    if v_score is not null and v_score < 50 then
      update public.users u
         set global_shadow_ban_starts_at = v_start,
             global_shadow_ban_until = v_start + interval '7 days'
       where u.id = new.muted_sender_id
         and (u.global_shadow_ban_until is null or u.global_shadow_ban_until < now());
    end if;
  elsif new.muted_sender_key is not null then
    insert into public.qa_trust_charges (recipient_id, sender_key) values (new.recipient_id, new.muted_sender_key)
    on conflict (recipient_id, sender_key) where sender_key is not null do nothing;
    get diagnostics v_new = row_count;
    if v_new = 0 then return new; end if;
    insert into public.qa_guest_trust as g (sender_key, trust_score)
         values (new.muted_sender_key, 80)
    on conflict (sender_key) do update
         set trust_score = greatest(0, g.trust_score - 20), updated_at = now()
    returning g.trust_score into v_score;
    if v_score < 50 then
      update public.qa_guest_trust g
         set ban_starts_at = v_start, ban_until = v_start + interval '7 days', updated_at = now()
       where g.sender_key = new.muted_sender_key
         and (g.ban_until is null or g.ban_until < now());
    end if;
  end if;
  return new;
end $$;

-- 4. Mute by message id: one action per message, sender resolved server-side.
create or replace function public.rout_qa_mute_by_message(p_message_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := public.rout_current_user_id();
  q record;
  v_action uuid;
begin
  if v_me is null then return false; end if;
  select owner_id, sender_user_id, sender_key into q from public.profile_questions where id = p_message_id;
  if not found or q.owner_id <> v_me then return false; end if;
  if exists (select 1 from public.qa_mute_actions a where a.recipient_id = v_me and a.source_question_id = p_message_id) then
    return true;
  end if;
  insert into public.qa_mute_actions (recipient_id, source_question_id) values (v_me, p_message_id) returning id into v_action;
  if q.sender_user_id is not null and q.sender_user_id <> v_me then
    insert into public.shadow_mutes (recipient_id, action_id, muted_sender_id) values (v_me, v_action, q.sender_user_id);
  end if;
  if q.sender_key is not null then
    insert into public.shadow_mutes (recipient_id, action_id, muted_sender_key) values (v_me, v_action, q.sender_key);
  end if;
  update public.profile_questions
     set is_quarantined = true, quarantine_reason = 'muted_by_owner', published = false
   where id = p_message_id;
  return true;
end $$;
revoke all on function public.rout_qa_mute_by_message(uuid) from public;

-- 5. The recipient's own list: when, and the message they muted. Never a sender.
create or replace function public.rout_qa_my_mutes()
returns table(id uuid, muted_at timestamptz, excerpt text, space text)
language sql stable security definer set search_path = public as $$
  select a.id, a.created_at, left(q.body, 140), q.space
    from public.qa_mute_actions a
    left join public.profile_questions q on q.id = a.source_question_id and q.owner_id = a.recipient_id
   where a.recipient_id = public.rout_current_user_id()
   order by a.created_at desc
   limit 500
$$;
revoke all on function public.rout_qa_my_mutes() from public;

-- 6. Lift: removes the action (and its sender rows); the muted message returns.
create or replace function public.rout_qa_unmute(p_action_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := public.rout_current_user_id();
  v_source uuid;
begin
  if v_me is null then return false; end if;
  delete from public.qa_mute_actions where id = p_action_id and recipient_id = v_me
  returning source_question_id into v_source;
  if not found then return false; end if;
  if v_source is not null then
    update public.profile_questions
       set is_quarantined = false, quarantine_reason = null
     where id = v_source and owner_id = v_me and quarantine_reason = 'muted_by_owner';
  end if;
  return true;
end $$;
revoke all on function public.rout_qa_unmute(uuid) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rout_app') then
    -- One door in and out: mutes are read and changed only through the functions.
    revoke all on public.shadow_mutes from rout_app;
    revoke all on public.qa_mute_actions from rout_app;
    revoke all on public.qa_trust_charges from rout_app;
    grant execute on function public.rout_qa_mute_by_message(uuid) to rout_app;
    grant execute on function public.rout_qa_my_mutes() to rout_app;
    grant execute on function public.rout_qa_unmute(uuid) to rout_app;
  end if;
end $$;
