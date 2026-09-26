-- Remove default product/status fallbacks from balance RPCs.
-- Empty warehouses / sections / stores / meklas return null product & status (UI shows —).

drop function if exists public.section_balances(uuid, uuid);
drop function if exists public.warehouse_balances(uuid);
drop function if exists public.store_balances(uuid);
drop function if exists public.mekla_balances(uuid);

create or replace function public.section_balances(
  p_warehouse_id uuid,
  p_season_id uuid default null
)
returns table (
  section_id uuid,
  section_name text,
  product_id uuid,
  product_name text,
  status_id uuid,
  status_name text,
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
  used as (
    select distinct d.section_id, d.product_id, d.status_id
    from public.warehouse_deliveries d
    where d.warehouse_id = p_warehouse_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
    union
    select distinct m.from_id, m.product_id, m.status_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.to_id, m.product_id, m.status_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  pairs as (
    select
      sec.id as section_id,
      sec.name as section_name,
      sec.notes,
      sec.is_active,
      u.product_id,
      u.status_id
    from public.warehouse_sections sec
    left join used u on u.section_id = sec.id
    where sec.warehouse_id = p_warehouse_id
      and sec.is_active = true
  ),
  in_agg as (
    select d.section_id, d.product_id, d.status_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.warehouse_id = p_warehouse_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.section_id, d.product_id, d.status_id
  ),
  out_agg as (
    select m.from_id as section_id, m.product_id, m.status_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.from_id, m.product_id, m.status_id
  ),
  back_in as (
    select m.to_id as section_id, m.product_id, m.status_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.to_id, m.product_id, m.status_id
  )
  select distinct on (pr.section_id, pr.product_id, pr.status_id)
    pr.section_id,
    pr.section_name,
    pr.product_id,
    prod.name as product_name,
    pr.status_id,
    st.name as status_name,
    pr.notes,
    pr.is_active,
    (coalesce(ia.kg_in, 0) + coalesce(bi.kg_back, 0))::numeric(14, 3) as kg_in,
    coalesce(oa.kg_out, 0)::numeric(14, 3) as kg_out,
    (
      coalesce(ia.kg_in, 0)
      + coalesce(bi.kg_back, 0)
      - coalesce(oa.kg_out, 0)
    )::numeric(14, 3) as kg_remaining
  from pairs pr
  left join public.products prod on prod.id = pr.product_id
  left join public.stock_statuses st on st.id = pr.status_id
  left join in_agg ia
    on ia.section_id = pr.section_id
    and ia.product_id is not distinct from pr.product_id
    and ia.status_id is not distinct from pr.status_id
  left join out_agg oa
    on oa.section_id = pr.section_id
    and oa.product_id is not distinct from pr.product_id
    and oa.status_id is not distinct from pr.status_id
  left join back_in bi
    on bi.section_id = pr.section_id
    and bi.product_id is not distinct from pr.product_id
    and bi.status_id is not distinct from pr.status_id
  order by pr.section_id, pr.product_id nulls first, pr.status_id nulls first,
           pr.section_name, prod.name nulls first, st.name nulls first;
$$;

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
  pairs as (
    select distinct d.warehouse_id, d.product_id, d.status_id
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
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
  order by w.name, prod.name nulls first, st.name nulls first;
$$;

create or replace function public.store_balances(p_season_id uuid default null)
returns table (
  store_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
  status_id uuid,
  status_name text,
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
  pairs as (
    select distinct m.to_id as store_id, m.product_id, m.status_id
    from public.stock_movements m
    where m.to_kind = 'store'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.from_id, m.product_id, m.status_id
    from public.stock_movements m
    where m.from_kind = 'store'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select
    st.id as store_id,
    st.name as store_name,
    pr.product_id,
    prod.name as product_name,
    pr.status_id,
    ss.name as status_name,
    st.notes,
    st.is_active,
    case
      when pr.product_id is null or pr.status_id is null then 0::numeric(14, 3)
      else public.location_remaining_kg(
        'store',
        st.id,
        pr.product_id,
        pr.status_id,
        (select id from season)
      )
    end as kg_total
  from public.stores st
  left join pairs pr on pr.store_id = st.id
  left join public.products prod on prod.id = pr.product_id
  left join public.stock_statuses ss on ss.id = pr.status_id
  where st.is_active = true
  order by st.name, prod.name nulls first, ss.name nulls first;
$$;

create or replace function public.mekla_balances(p_season_id uuid default null)
returns table (
  mekla_id uuid,
  mekla_name text,
  product_id uuid,
  product_name text,
  status_id uuid,
  status_name text,
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
  pairs as (
    select distinct m.to_id as mekla_id, m.product_id, m.status_id
    from public.stock_movements m
    where m.to_kind = 'mekla'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.from_id, m.product_id, m.status_id
    from public.stock_movements m
    where m.from_kind = 'mekla'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select
    mk.id as mekla_id,
    mk.name as mekla_name,
    pr.product_id,
    prod.name as product_name,
    pr.status_id,
    ss.name as status_name,
    mk.notes,
    mk.is_active,
    case
      when pr.product_id is null or pr.status_id is null then 0::numeric(14, 3)
      else public.location_remaining_kg(
        'mekla',
        mk.id,
        pr.product_id,
        pr.status_id,
        (select id from season)
      )
    end as kg_total
  from public.meklas mk
  left join pairs pr on pr.mekla_id = mk.id
  left join public.products prod on prod.id = pr.product_id
  left join public.stock_statuses ss on ss.id = pr.status_id
  where mk.is_active = true
  order by mk.name, prod.name nulls first, ss.name nulls first;
$$;

grant execute on function public.section_balances(uuid, uuid) to authenticated;
grant execute on function public.warehouse_balances(uuid) to authenticated;
grant execute on function public.store_balances(uuid) to authenticated;
grant execute on function public.mekla_balances(uuid) to authenticated;
