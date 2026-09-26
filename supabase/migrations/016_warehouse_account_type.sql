-- Warehouse account type (same enum as suppliers: normal / investment / company)

alter table public.warehouses
  add column if not exists account_type public.supplier_account_type not null default 'normal';

drop function if exists public.warehouse_balances(uuid);

create or replace function public.warehouse_balances(p_season_id uuid default null)
returns table (
  warehouse_id uuid,
  warehouse_name text,
  notes text,
  is_active boolean,
  account_type public.supplier_account_type,
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
    w.account_type,
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

grant execute on function public.warehouse_balances(uuid) to authenticated;
