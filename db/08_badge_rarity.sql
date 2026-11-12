-- Badge rarity, supply cap and per-badge serial numbers (idempotent).
-- "De Influencer" (10 uitnodigingen) is Epic and gets a unique sequence
-- number, assigned automatically the moment a member unlocks it.

alter table public.badges add column if not exists rarity text not null default 'common';
alter table public.badges add column if not exists max_supply integer;

alter table public.user_badges add column if not exists serial_number integer;

update public.badges set rarity = 'epic' where slug = 'influencer';
update public.badges set description = '10 vrienden uitgenodigd op ROUT.' where slug = 'influencer';

create or replace function public.assign_badge_serial_number()
returns trigger
language plpgsql
as $$
begin
  if new.serial_number is null then
    select coalesce(max(serial_number), 0) + 1
      into new.serial_number
      from public.user_badges
     where badge_id = new.badge_id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_badges_assign_serial on public.user_badges;
create trigger user_badges_assign_serial
  before insert on public.user_badges
  for each row execute function public.assign_badge_serial_number();

-- Back-fill existing grants that predate the serial column, oldest first.
with ordered as (
  select id, row_number() over (partition by badge_id order by awarded_at, id) as rn
    from public.user_badges
   where serial_number is null
)
update public.user_badges ub
   set serial_number = ordered.rn
  from ordered
 where ub.id = ordered.id;

create unique index if not exists user_badges_badge_serial_idx
  on public.user_badges (badge_id, serial_number);
