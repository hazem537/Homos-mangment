-- Supplier account type + soft-delete filtering in balance RPCs

create type public.supplier_account_type as enum ('normal', 'investment', 'company');

alter table public.suppliers
  add column if not exists account_type public.supplier_account_type not null default 'normal';

-- Recreate supplier balance RPCs with account_type; hide soft-deleted suppliers
drop function if exists public.supplier_due(uuid, uuid);
drop function if exists public.supplier_balances(uuid);

create or replace function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  notes text,
  is_active boolean,
  account_type public.supplier_account_type,
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
    select s.id, s.ardab_factor
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
      coalesce(sum(p.quantity_kg), 0)::numeric(14, 3) as kg_total
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
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_delivered
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.supplier_id
  ),
  calc as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      s.notes,
      s.is_active,
      s.account_type,
      coalesce(pa.purchases_total, 0)::numeric(14, 2) as purchases_total,
      coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
      (coalesce(pa.purchases_total, 0) - coalesce(ta.transfers_total, 0))::numeric(14, 2) as balance,
      coalesce(pa.kg_total, 0)::numeric(14, 3) as kg_total,
      coalesce(da.kg_delivered, 0)::numeric(14, 3) as kg_delivered,
      coalesce((select ardab_factor from season), 170)::numeric as factor
    from public.suppliers s
    left join purchase_agg pa on pa.supplier_id = s.id
    left join transfer_agg ta on ta.supplier_id = s.id
    left join delivery_agg da on da.supplier_id = s.id
    where s.is_active = true
  )
  select
    c.supplier_id,
    c.supplier_name,
    c.notes,
    c.is_active,
    c.account_type,
    c.purchases_total,
    c.transfers_total,
    c.balance,
    (c.kg_total / nullif(c.factor, 0))::numeric(14, 4) as ardab_total,
    (c.kg_delivered / nullif(c.factor, 0))::numeric(14, 4) as ardab_delivered,
    case
      when abs((c.kg_total - c.kg_delivered) / nullif(c.factor, 0)) < 0.00005 then 0::numeric(14, 4)
      else ((c.kg_total - c.kg_delivered) / nullif(c.factor, 0))::numeric(14, 4)
    end as ardab_remaining
  from calc c
  order by c.supplier_name;
$$;

create or replace function public.supplier_due(
  p_supplier_id uuid,
  p_season_id uuid default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  account_type public.supplier_account_type,
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
    b.account_type,
    b.purchases_total,
    b.transfers_total,
    b.balance,
    b.ardab_total,
    b.ardab_delivered,
    b.ardab_remaining
  from public.supplier_balances(p_season_id) b
  where b.supplier_id = p_supplier_id;
$$;

-- Hide soft-deleted warehouses from balances
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
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_total
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
    (
      coalesce(da.kg_total, 0)
      / nullif(coalesce((select ardab_factor from season), 170), 0)
    )::numeric(14, 4) as ardab_total
  from public.warehouses w
  left join delivery_agg da on da.warehouse_id = w.id
  where w.is_active = true
  order by w.name;
$$;

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;
grant execute on function public.warehouse_balances(uuid) to authenticated;
