-- Add username login support for DBs that already ran 001_init.sql
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE

alter table public.profiles
  add column if not exists username text;

-- Backfill from auth email local-part when missing
update public.profiles p
set username = lower(split_part(u.email, '@', 1))
from auth.users u
where p.id = u.id
  and (p.username is null or btrim(p.username) = '');

-- Enforce not null after backfill
alter table public.profiles
  alter column username set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_format check (
        username ~ '^[a-z0-9._-]{3,32}$'
      );
  end if;
end $$;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(trim(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  )));

  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_username),
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.app_role,
      'admin'
    )
  );
  return new;
end;
$$;
