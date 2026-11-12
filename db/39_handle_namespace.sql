-- 39 — Eén gedeelde naamruimte voor publieke handles.
--
-- ROUT kent per account maximaal twee profielen:
--   • gratis aliasprofiel   → rout.be/u/<alias_profiles.handle>
--   • geverifieerd profiel  → rout.be/<profiles.username>
--
-- `profiles.subdomain_alias` is géén derde profiel maar een extra root-URL
-- naar hetzelfde geverifieerde profiel. Alle drie de kolommen delen daarom
-- dezelfde naamruimte: één naam mag nooit naar twee accounts wijzen.

-- Root-domeinnaam is op zichzelf al uniek.
create unique index if not exists profiles_subdomain_alias_ci_key
  on public.profiles (lower(subdomain_alias))
  where subdomain_alias is not null and subdomain_alias <> '';

-- Kruiscontrole tussen de kolommen/tabellen (geen enkele index kan dit).
create or replace function public.assert_handle_namespace_free(
  _handle text,
  _user_id uuid
) returns void
language plpgsql
as $$
declare
  _h text := lower(btrim(coalesce(_handle, '')));
  _owner uuid;
begin
  if _h = '' then
    return;
  end if;

  select id into _owner
    from public.profiles
   where (lower(username) = _h or lower(coalesce(subdomain_alias, '')) = _h)
     and id <> _user_id
   limit 1;
  if _owner is not null then
    raise exception 'handle_taken: % is al in gebruik', _h using errcode = 'unique_violation';
  end if;

  if to_regclass('public.alias_profiles') is not null then
    execute 'select user_id from public.alias_profiles where lower(handle) = $1 and user_id <> $2 limit 1'
      into _owner using _h, _user_id;
    if _owner is not null then
      raise exception 'handle_taken: % is al in gebruik', _h using errcode = 'unique_violation';
    end if;
  end if;
end;
$$;

create or replace function public.profiles_handle_namespace_guard()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from coalesce(old.username, null) then
    perform public.assert_handle_namespace_free(new.username, new.id);
  end if;
  if new.subdomain_alias is distinct from coalesce(old.subdomain_alias, null) then
    perform public.assert_handle_namespace_free(new.subdomain_alias, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_handle_namespace_guard on public.profiles;
create trigger profiles_handle_namespace_guard
  before insert or update of username, subdomain_alias on public.profiles
  for each row execute function public.profiles_handle_namespace_guard();

create or replace function public.alias_profiles_handle_namespace_guard()
returns trigger
language plpgsql
as $$
begin
  if new.handle is distinct from coalesce(old.handle, null) then
    perform public.assert_handle_namespace_free(new.handle, new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists alias_profiles_handle_namespace_guard on public.alias_profiles;
create trigger alias_profiles_handle_namespace_guard
  before insert or update of handle on public.alias_profiles
  for each row execute function public.alias_profiles_handle_namespace_guard();
