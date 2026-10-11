-- Count only warehouse-bound deliveries in warehouse_balances
-- (store deliveries use destination_kind = 'store' and must not inflate shoon stock)

create or replace function public.warehouse_balances(p_season_id uuid default null)
returns table (
  warehouse_id uuid,
  warehouse_name text,
  product_id uuid,
  product_name text,
  status_id uuid,
  status_name text,
  notes text,
  is_active boolean,
  account_type_id uuid,
  account_type_name text,
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
  pairs as (
    select distinct d.warehouse_id, d.product_id, d.status_id
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
      and coalesce(d.destination_kind, 'warehouse') = 'warehouse'
      and d.warehouse_id is not null
    union
    select distinct sec.warehouse_id, m.product_id, m.status_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct sec.warehouse_id, m.product_id, m.status_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  delivery_agg as (
    select d.warehouse_id, d.product_id, d.status_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
      and coalesce(d.destination_kind, 'warehouse') = 'warehouse'
      and d.warehouse_id is not null
    group by d.warehouse_id, d.product_id, d.status_id
  ),
  out_agg as (
    select sec.warehouse_id, m.product_id, m.status_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id, m.product_id, m.status_id
  ),
  back_agg as (
    select sec.warehouse_id, m.product_id, m.status_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id, m.product_id, m.status_id
  )
  select
    w.id as warehouse_id,
    w.name as warehouse_name,
    pr.product_id,
    prod.name as product_name,
    pr.status_id,
    st.name as status_name,
    w.notes,
    w.is_active,
    w.account_type_id,
    at.name as account_type_name,
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
  join public.account_types at on at.id = w.account_type_id
  left join pairs pr on pr.warehouse_id = w.id
  left join public.products prod on prod.id = pr.product_id
  left join public.stock_statuses st on st.id = pr.status_id
  left join delivery_agg da
    on da.warehouse_id = w.id
    and da.product_id is not distinct from pr.product_id
    and da.status_id is not distinct from pr.status_id
  left join out_agg oa
    on oa.warehouse_id = w.id
    and oa.product_id is not distinct from pr.product_id
    and oa.status_id is not distinct from pr.status_id
  left join back_agg ba
    on ba.warehouse_id = w.id
    and ba.product_id is not distinct from pr.product_id
    and ba.status_id is not distinct from pr.status_id
  where w.is_active = true
  order by w.name, at.name, prod.name nulls first, st.name nulls first;
$$;

grant execute on function public.warehouse_balances(uuid) to authenticated;
