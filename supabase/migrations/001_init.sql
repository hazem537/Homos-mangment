-- Homos raw chickpea management — MVP-1 schema
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";

-- Roles for app users
create type public.app_role as enum ('admin', 'accountant', 'warehouse');

-- Profiles linked to auth.users
-- Login uses username; Supabase Auth still stores email as username@homos.local
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  full_name text,
  role public.app_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username ~ '^[a-z0-9._-]{3,32}$'
  )
);

create unique index profiles_username_unique on public.profiles (lower(username));

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null unique,
  ardab_factor numeric(10, 4) not null default 170,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_ardab_factor_positive check (ardab_factor > 0)
);

-- Only one active season at a time
create unique index seasons_one_active on public.seasons (is_active) where is_active = true;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index suppliers_name_unique on public.suppliers (lower(name));

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index warehouses_name_unique on public.warehouses (lower(name));

-- Auto profile on signup (username from metadata, else email local-part)
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger seasons_updated_at before update on public.seasons
  for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger warehouses_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.suppliers enable row level security;
alter table public.warehouses enable row level security;

create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

create policy "Authenticated can read seasons"
  on public.seasons for select to authenticated using (true);
create policy "Authenticated can insert seasons"
  on public.seasons for insert to authenticated with check (true);
create policy "Authenticated can update seasons"
  on public.seasons for update to authenticated using (true);
create policy "Authenticated can delete seasons"
  on public.seasons for delete to authenticated using (true);

create policy "Authenticated can read suppliers"
  on public.suppliers for select to authenticated using (true);
create policy "Authenticated can insert suppliers"
  on public.suppliers for insert to authenticated with check (true);
create policy "Authenticated can update suppliers"
  on public.suppliers for update to authenticated using (true);
create policy "Authenticated can delete suppliers"
  on public.suppliers for delete to authenticated using (true);

create policy "Authenticated can read warehouses"
  on public.warehouses for select to authenticated using (true);
create policy "Authenticated can insert warehouses"
  on public.warehouses for insert to authenticated with check (true);
create policy "Authenticated can update warehouses"
  on public.warehouses for update to authenticated using (true);
create policy "Authenticated can delete warehouses"
  on public.warehouses for delete to authenticated using (true);

-- Seed season 2026 and sample warehouses from Excel
insert into public.seasons (name, year, ardab_factor, is_active)
values ('موسم 2026', 2026, 170, true)
on conflict (year) do nothing;

insert into public.warehouses (name)
select v.name
from (
  values
    ('شونة طنطا'),
    ('شونة تقى'),
    ('شونة دمنهور'),
    ('شونة محمود صدقى'),
    ('شونة عبدالناصر'),
    ('شونة عاطف'),
    ('شونة حامد')
) as v(name)
where not exists (
  select 1 from public.warehouses w where lower(w.name) = lower(v.name)
);
