-- Phase 2+3: مخزن، مقلى، عميل، stock_movements + wire section_balances.kg_out

create type public.stock_location_kind as enum (
  'section',
  'store',
  'mekla',
  'client'
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_name_not_blank check (length(trim(name)) > 0)
);

create unique index stores_active_name_unique
  on public.stores (lower(trim(name)))
  where is_active = true;

create trigger stores_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

alter table public.stores enable row level security;
create policy "Authenticated can read stores"
  on public.stores for select to authenticated using (true);
create policy "Authenticated can insert stores"
  on public.stores for insert to authenticated with check (true);
create policy "Authenticated can update stores"
  on public.stores for update to authenticated using (true);
create policy "Authenticated can delete stores"
  on public.stores for delete to authenticated using (true);

create table public.meklas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meklas_name_not_blank check (length(trim(name)) > 0)
);

create unique index meklas_active_name_unique
  on public.meklas (lower(trim(name)))
  where is_active = true;

create trigger meklas_updated_at
  before update on public.meklas
  for each row execute function public.set_updated_at();

alter table public.meklas enable row level security;
create policy "Authenticated can read meklas"
  on public.meklas for select to authenticated using (true);
create policy "Authenticated can insert meklas"
  on public.meklas for insert to authenticated with check (true);
create policy "Authenticated can update meklas"
  on public.meklas for update to authenticated using (true);
create policy "Authenticated can delete meklas"
  on public.meklas for delete to authenticated using (true);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_name_not_blank check (length(trim(name)) > 0)
);

create unique index clients_active_name_unique
  on public.clients (lower(trim(name)))
  where is_active = true;

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
create policy "Authenticated can read clients"
  on public.clients for select to authenticated using (true);
create policy "Authenticated can insert clients"
  on public.clients for insert to authenticated with check (true);
create policy "Authenticated can update clients"
  on public.clients for update to authenticated using (true);
create policy "Authenticated can delete clients"
  on public.clients for delete to authenticated using (true);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  movement_date date not null default (current_date),
  quantity_kg numeric(14, 3) not null,
  from_kind public.stock_location_kind not null,
  from_id uuid not null,
  to_kind public.stock_location_kind not null,
  to_id uuid not null,
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_movements_quantity_positive check (quantity_kg > 0),
  constraint stock_movements_from_kind_check check (
    from_kind in ('section', 'store', 'mekla')
  ),
  constraint stock_movements_to_kind_check check (
    to_kind in ('section', 'store', 'mekla', 'client')
  ),
  constraint stock_movements_not_same_endpoint check (
    not (from_kind = to_kind and from_id = to_id)
  )
);

create index stock_movements_season_idx on public.stock_movements (season_id);
create index stock_movements_from_idx on public.stock_movements (from_kind, from_id);
create index stock_movements_to_idx on public.stock_movements (to_kind, to_id);
create index stock_movements_date_idx on public.stock_movements (movement_date desc);

create trigger stock_movements_updated_at
  before update on public.stock_movements
  for each row execute function public.set_updated_at();

alter table public.stock_movements enable row level security;
create policy "Authenticated can read stock_movements"
  on public.stock_movements for select to authenticated using (true);
create policy "Authenticated can insert stock_movements"
  on public.stock_movements for insert to authenticated with check (true);
create policy "Authenticated can update stock_movements"
  on public.stock_movements for update to authenticated using (true);
create policy "Authenticated can delete stock_movements"
  on public.stock_movements for delete to authenticated using (true);

-- Remaining kg at a location (section / store / mekla)
create or replace function public.location_remaining_kg(
  p_kind public.stock_location_kind,
  p_id uuid,
  p_season_id uuid default null
)
returns numeric
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
  inbound as (
    select coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg
    from public.warehouse_deliveries d
    where p_kind = 'section'
      and d.section_id = p_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
  ),
  moved_in as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.to_kind = p_kind
      and m.to_id = p_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  moved_out as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.from_kind = p_kind
      and m.from_id = p_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select (
    case when p_kind = 'section' then coalesce((select kg from inbound), 0) else 0 end
    + coalesce((select kg from moved_in), 0)
    - coalesce((select kg from moved_out), 0)
  )::numeric(14, 3);
$$;

grant execute on function public.location_remaining_kg(
  public.stock_location_kind,
  uuid,
  uuid
) to authenticated;

create or replace function public.check_stock_movement_remaining()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining numeric(14, 3);
begin
  if new.is_cancelled then
    return new;
  end if;

  v_remaining := public.location_remaining_kg(
    new.from_kind,
    new.from_id,
    new.season_id
  );

  -- When inserting, remaining does not yet subtract this row; when updating quantity, recompute without this row
  if tg_op = 'UPDATE' and not old.is_cancelled then
    v_remaining := v_remaining + old.quantity_kg;
  end if;

  if new.quantity_kg > v_remaining + 0.001 then
    raise exception 'الكمية أكبر من الرصيد المتاح (% كجم)', v_remaining;
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movements_remaining_check on public.stock_movements;
create trigger stock_movements_remaining_check
  before insert or update of quantity_kg, from_kind, from_id, season_id, is_cancelled
  on public.stock_movements
  for each row execute function public.check_stock_movement_remaining();

-- section_balances with kg_out from movements
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
  ),
  out_agg as (
    select
      m.from_id as section_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.from_id
  ),
  back_in as (
    select
      m.to_id as section_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.to_id
  )
  select
    sec.id as section_id,
    sec.name as section_name,
    sec.notes,
    sec.is_active,
    (coalesce(ia.kg_in, 0) + coalesce(bi.kg_back, 0))::numeric(14, 3) as kg_in,
    coalesce(oa.kg_out, 0)::numeric(14, 3) as kg_out,
    (
      coalesce(ia.kg_in, 0)
      + coalesce(bi.kg_back, 0)
      - coalesce(oa.kg_out, 0)
    )::numeric(14, 3) as kg_remaining
  from public.warehouse_sections sec
  left join in_agg ia on ia.section_id = sec.id
  left join out_agg oa on oa.section_id = sec.id
  left join back_in bi on bi.section_id = sec.id
  where sec.warehouse_id = p_warehouse_id
    and sec.is_active = true
  order by sec.name;
$$;

-- Warehouse list: remaining = section in − section out (sum of أرباع)
create or replace function public.warehouse_balances(p_season_id uuid default null)
returns table (
  warehouse_id uuid,
  warehouse_name text,
  notes text,
  is_active boolean,
  kg_total numeric,
  ardab_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with season as (
    select s.id, s.ardab_factor
    from public.seasons s
    where s.id = coalesce(
      p_season_id,
      (select a.id from public.seasons a where a.is_active = true limit 1)
    )
  ),
  delivery_agg as (
    select
      d.warehouse_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.warehouse_id
  ),
  out_agg as (
    select
      sec.warehouse_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id
  ),
  back_agg as (
    select
      sec.warehouse_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id
  )
  select
    w.id as warehouse_id,
    w.name as warehouse_name,
    w.notes,
    w.is_active,
    (
      coalesce(da.kg_in, 0)
      + coalesce(ba.kg_back, 0)
      - coalesce(oa.kg_out, 0)
    )::numeric(14, 3) as kg_total,
    (
      (
        coalesce(da.kg_in, 0)
        + coalesce(ba.kg_back, 0)
        - coalesce(oa.kg_out, 0)
      )
      / nullif(coalesce((select ardab_factor from season), 170), 0)
    )::numeric(14, 4) as ardab_total
  from public.warehouses w
  left join delivery_agg da on da.warehouse_id = w.id
  left join out_agg oa on oa.warehouse_id = w.id
  left join back_agg ba on ba.warehouse_id = w.id
  where w.is_active = true
  order by w.name;
$$;

-- Store / mekla balances for masters
create or replace function public.store_balances(p_season_id uuid default null)
returns table (
  store_id uuid,
  store_name text,
  notes text,
  is_active boolean,
  kg_total numeric
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
  agg as (
    select
      st.id as store_id,
      public.location_remaining_kg('store', st.id, (select id from season)) as kg_total
    from public.stores st
    where st.is_active = true
  )
  select
    st.id as store_id,
    st.name as store_name,
    st.notes,
    st.is_active,
    coalesce(a.kg_total, 0)::numeric(14, 3) as kg_total
  from public.stores st
  left join agg a on a.store_id = st.id
  where st.is_active = true
  order by st.name;
$$;

create or replace function public.mekla_balances(p_season_id uuid default null)
returns table (
  mekla_id uuid,
  mekla_name text,
  notes text,
  is_active boolean,
  kg_total numeric
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
  agg as (
    select
      mk.id as mekla_id,
      public.location_remaining_kg('mekla', mk.id, (select id from season)) as kg_total
    from public.meklas mk
    where mk.is_active = true
  )
  select
    mk.id as mekla_id,
    mk.name as mekla_name,
    mk.notes,
    mk.is_active,
    coalesce(a.kg_total, 0)::numeric(14, 3) as kg_total
  from public.meklas mk
  left join agg a on a.mekla_id = mk.id
  where mk.is_active = true
  order by mk.name;
$$;

grant execute on function public.store_balances(uuid) to authenticated;
grant execute on function public.mekla_balances(uuid) to authenticated;
grant execute on function public.warehouse_balances(uuid) to authenticated;
grant execute on function public.section_balances(uuid, uuid) to authenticated;
