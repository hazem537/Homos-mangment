-- E05: warehouse inbound deliveries + stock / supplier delivery balances

create table public.warehouse_deliveries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  warehouse_id uuid not null references public.warehouses (id),
  supplier_id uuid not null references public.suppliers (id),
  delivery_date date not null default (current_date),
  quantity_kg numeric(14, 3) not null,
  ardab numeric(14, 4) not null,
  vehicle_number text,
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_deliveries_quantity_positive check (quantity_kg > 0),
  constraint warehouse_deliveries_ardab_positive check (ardab > 0)
);

create index warehouse_deliveries_season_idx on public.warehouse_deliveries (season_id);
create index warehouse_deliveries_warehouse_idx on public.warehouse_deliveries (warehouse_id);
create index warehouse_deliveries_supplier_idx on public.warehouse_deliveries (supplier_id);
create index warehouse_deliveries_date_idx on public.warehouse_deliveries (delivery_date desc);

create trigger warehouse_deliveries_updated_at before update on public.warehouse_deliveries
  for each row execute function public.set_updated_at();

alter table public.warehouse_deliveries enable row level security;

create policy "Authenticated can read warehouse_deliveries"
  on public.warehouse_deliveries for select to authenticated using (true);
create policy "Authenticated can insert warehouse_deliveries"
  on public.warehouse_deliveries for insert to authenticated with check (true);
create policy "Authenticated can update warehouse_deliveries"
  on public.warehouse_deliveries for update to authenticated using (true);
create policy "Authenticated can delete warehouse_deliveries"
  on public.warehouse_deliveries for delete to authenticated using (true);

-- Warehouse stock for active season (inbound only until outbound exists)
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
    select s.id
    from public.seasons s
    where s.id = coalesce(
      p_season_id,
      (select a.id from public.seasons a where a.is_active = true limit 1)
    )
  ),
  delivery_agg as (
    select
      d.warehouse_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_total,
      coalesce(sum(d.ardab), 0)::numeric(14, 4) as ardab_total
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.warehouse_id
  )
  select
    w.id as warehouse_id,
    w.name as warehouse_name,
    w.notes,
    w.is_active,
    coalesce(da.kg_total, 0)::numeric(14, 3) as kg_total,
    coalesce(da.ardab_total, 0)::numeric(14, 4) as ardab_total
  from public.warehouses w
  left join delivery_agg da on da.warehouse_id = w.id
  order by w.name;
$$;

-- Recreate supplier_balances with delivered/remaining ardab
drop function if exists public.supplier_due(uuid, uuid);
drop function if exists public.supplier_balances(uuid);

create or replace function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  notes text,
  is_active boolean,
  purchases_total numeric,
  transfers_total numeric,
  balance numeric,
  ardab_total numeric,
  ardab_delivered numeric,
  ardab_remaining numeric
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
  purchase_agg as (
    select
      p.supplier_id,
      coalesce(sum(p.total_price), 0)::numeric(14, 2) as purchases_total,
      coalesce(sum(p.ardab), 0)::numeric(14, 4) as ardab_total
    from public.purchases p
    where p.season_id = (select id from season)
      and p.is_cancelled = false
    group by p.supplier_id
  ),
  transfer_agg as (
    select
      t.supplier_id,
      coalesce(sum(t.amount), 0)::numeric(14, 2) as transfers_total
    from public.cash_transfers t
    where t.season_id = (select id from season)
      and t.is_cancelled = false
    group by t.supplier_id
  ),
  delivery_agg as (
    select
      d.supplier_id,
      coalesce(sum(d.ardab), 0)::numeric(14, 4) as ardab_delivered
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.supplier_id
  )
  select
    s.id as supplier_id,
    s.name as supplier_name,
    s.notes,
    s.is_active,
    coalesce(pa.purchases_total, 0)::numeric(14, 2) as purchases_total,
    coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
    (coalesce(pa.purchases_total, 0) - coalesce(ta.transfers_total, 0))::numeric(14, 2) as balance,
    coalesce(pa.ardab_total, 0)::numeric(14, 4) as ardab_total,
    coalesce(da.ardab_delivered, 0)::numeric(14, 4) as ardab_delivered,
    (coalesce(pa.ardab_total, 0) - coalesce(da.ardab_delivered, 0))::numeric(14, 4) as ardab_remaining
  from public.suppliers s
  left join purchase_agg pa on pa.supplier_id = s.id
  left join transfer_agg ta on ta.supplier_id = s.id
  left join delivery_agg da on da.supplier_id = s.id
  order by s.name;
$$;

create or replace function public.supplier_due(
  p_supplier_id uuid,
  p_season_id uuid default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  purchases_total numeric,
  transfers_total numeric,
  balance numeric,
  ardab_total numeric,
  ardab_delivered numeric,
  ardab_remaining numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.supplier_id,
    b.supplier_name,
    b.purchases_total,
    b.transfers_total,
    b.balance,
    b.ardab_total,
    b.ardab_delivered,
    b.ardab_remaining
  from public.supplier_balances(p_season_id) b
  where b.supplier_id = p_supplier_id;
$$;

grant execute on function public.warehouse_balances(uuid) to authenticated;
grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;
