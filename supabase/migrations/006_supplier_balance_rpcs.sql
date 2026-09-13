-- Supplier money logic in one place (RPC)
-- Active season is resolved inside the functions when p_season_id is null

create or replace function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  notes text,
  is_active boolean,
  purchases_total numeric,
  transfers_total numeric,
  balance numeric,
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
  )
  select
    s.id as supplier_id,
    s.name as supplier_name,
    s.notes,
    s.is_active,
    coalesce(pa.purchases_total, 0)::numeric(14, 2) as purchases_total,
    coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
    (coalesce(pa.purchases_total, 0) - coalesce(ta.transfers_total, 0))::numeric(14, 2) as balance,
    coalesce(pa.ardab_total, 0)::numeric(14, 4) as ardab_total
  from public.suppliers s
  left join purchase_agg pa on pa.supplier_id = s.id
  left join transfer_agg ta on ta.supplier_id = s.id
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
  ardab_total numeric
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
    b.ardab_total
  from public.supplier_balances(p_season_id) b
  where b.supplier_id = p_supplier_id;
$$;

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;
