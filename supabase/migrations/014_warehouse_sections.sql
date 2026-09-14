-- Phase 1: ربع (warehouse sections) + delivery.section_id + section_balances

create table public.warehouse_sections (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_sections_name_not_blank check (length(trim(name)) > 0)
);

create unique index warehouse_sections_active_name_unique
  on public.warehouse_sections (warehouse_id, lower(trim(name)))
  where is_active = true;

create index warehouse_sections_warehouse_idx
  on public.warehouse_sections (warehouse_id);

create trigger warehouse_sections_updated_at
  before update on public.warehouse_sections
  for each row execute function public.set_updated_at();

alter table public.warehouse_sections enable row level security;

create policy "Authenticated can read warehouse_sections"
  on public.warehouse_sections for select to authenticated using (true);
create policy "Authenticated can insert warehouse_sections"
  on public.warehouse_sections for insert to authenticated with check (true);
create policy "Authenticated can update warehouse_sections"
  on public.warehouse_sections for update to authenticated using (true);
create policy "Authenticated can delete warehouse_sections"
  on public.warehouse_sections for delete to authenticated using (true);

-- Auto-create ربع «عام» for every new warehouse
create or replace function public.create_default_warehouse_section()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.warehouse_sections s
    where s.warehouse_id = new.id
      and s.is_active = true
      and lower(trim(s.name)) = 'عام'
  ) then
    insert into public.warehouse_sections (warehouse_id, name, notes)
    values (new.id, 'عام', 'ربع افتراضي');
  end if;
  return new;
end;
$$;

drop trigger if exists warehouses_default_section on public.warehouses;
create trigger warehouses_default_section
  after insert on public.warehouses
  for each row execute function public.create_default_warehouse_section();

-- Backfill عام for existing warehouses
insert into public.warehouse_sections (warehouse_id, name, notes)
select w.id, 'عام', 'ربع افتراضي'
from public.warehouses w
where not exists (
  select 1
  from public.warehouse_sections s
  where s.warehouse_id = w.id
    and s.is_active = true
    and lower(trim(s.name)) = 'عام'
);

-- Delivery lands in a ربع
alter table public.warehouse_deliveries
  add column if not exists section_id uuid references public.warehouse_sections (id);

update public.warehouse_deliveries d
set section_id = s.id
from public.warehouse_sections s
where d.section_id is null
  and s.warehouse_id = d.warehouse_id
  and s.is_active = true
  and lower(trim(s.name)) = 'عام';

-- Any leftover without عام name match: first active section of warehouse
update public.warehouse_deliveries d
set section_id = (
  select s.id
  from public.warehouse_sections s
  where s.warehouse_id = d.warehouse_id
    and s.is_active = true
  order by s.created_at
  limit 1
)
where d.section_id is null;

alter table public.warehouse_deliveries
  alter column section_id set not null;

create index if not exists warehouse_deliveries_section_idx
  on public.warehouse_deliveries (section_id);

-- Ensure section belongs to selected warehouse
create or replace function public.check_delivery_section_warehouse()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_warehouse_id uuid;
begin
  select s.warehouse_id into v_warehouse_id
  from public.warehouse_sections s
  where s.id = new.section_id;

  if v_warehouse_id is null then
    raise exception 'الربع غير موجود';
  end if;
  if v_warehouse_id <> new.warehouse_id then
    raise exception 'الربع لا يتبع الشونة المحددة';
  end if;
  return new;
end;
$$;

drop trigger if exists warehouse_deliveries_section_check on public.warehouse_deliveries;
create trigger warehouse_deliveries_section_check
  before insert or update of section_id, warehouse_id on public.warehouse_deliveries
  for each row execute function public.check_delivery_section_warehouse();

-- Per-ربع balances (kg_out = 0 until stock_movements exist)
create or replace function public.section_balances(
  p_warehouse_id uuid,
  p_season_id uuid default null
)
returns table (
  section_id uuid,
  section_name text,
  notes text,
  is_active boolean,
  kg_in numeric,
  kg_out numeric,
  kg_remaining numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with season as (
    select s.id
    from public.seasons s
    where s.id = coalesce(
      p_season_id,
      (select a.id from public.seasons a where a.is_active = true limit 1)
    )
  ),
  in_agg as (
    select
      d.section_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.warehouse_id = p_warehouse_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.section_id
  )
  select
    sec.id as section_id,
    sec.name as section_name,
    sec.notes,
    sec.is_active,
    coalesce(ia.kg_in, 0)::numeric(14, 3) as kg_in,
    0::numeric(14, 3) as kg_out,
    coalesce(ia.kg_in, 0)::numeric(14, 3) as kg_remaining
  from public.warehouse_sections sec
  left join in_agg ia on ia.section_id = sec.id
  where sec.warehouse_id = p_warehouse_id
    and sec.is_active = true
  order by sec.name;
$$;

grant execute on function public.section_balances(uuid, uuid) to authenticated;

-- Warehouse totals remain sum of inbound deliveries (Phase 1)
-- (reaffirm existing warehouse_balances; no outbound yet)
