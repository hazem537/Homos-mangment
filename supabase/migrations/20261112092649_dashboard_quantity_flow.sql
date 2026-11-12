-- Dashboard quantity flow: server-side aggregation for لوحة التحكم
-- Replaces client-side summing/attribution over purchases, deliveries, movements, balances.

create or replace function public.dashboard_quantity_flow(
  p_season_id uuid,
  p_product_id uuid,
  p_account_type_id uuid default null,
  p_supplier_id uuid default null
)
returns table (
  purchased_kg numeric,
  delivered_kg numeric,
  remaining_kg numeric,
  warehouse_kg numeric,
  store_kg numeric,
  mekla_kg numeric,
  sold_kg numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_filters_open boolean := (p_account_type_id is null and p_supplier_id is null);
  v_purchased numeric := 0;
  v_delivered numeric := 0;
  v_remaining numeric := 0;
  v_warehouse numeric := 0;
  v_store numeric := 0;
  v_mekla numeric := 0;
  v_sold numeric := 0;
begin
  if p_season_id is null or p_product_id is null then
    return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  -- Purchased / delivered (always filter by supplier + account type)
  select coalesce(sum(p.quantity_kg), 0)
  into v_purchased
  from public.purchases p
  join public.suppliers s on s.id = p.supplier_id
  where p.season_id = p_season_id
    and p.product_id = p_product_id
    and p.is_cancelled = false
    and (p_supplier_id is null or p.supplier_id = p_supplier_id)
    and (p_account_type_id is null or s.account_type_id = p_account_type_id);

  select coalesce(sum(d.quantity_kg), 0)
  into v_delivered
  from public.warehouse_deliveries d
  join public.suppliers s on s.id = d.supplier_id
  where d.season_id = p_season_id
    and d.product_id = p_product_id
    and d.is_cancelled = false
    and (p_supplier_id is null or d.supplier_id = p_supplier_id)
    and (p_account_type_id is null or s.account_type_id = p_account_type_id);

  if v_filters_open then
    select coalesce(sum(wb.kg_total), 0)
    into v_warehouse
    from public.warehouse_balances(p_season_id) wb
    where wb.product_id = p_product_id
      and coalesce(wb.kg_total, 0) > 0.00005;

    select coalesce(sum(sb.kg_total), 0)
    into v_store
    from public.store_balances(p_season_id) sb
    where sb.product_id = p_product_id
      and coalesce(sb.kg_total, 0) > 0.00005;

    select coalesce(sum(mb.kg_total), 0)
    into v_mekla
    from public.mekla_balances(p_season_id) mb
    where mb.product_id = p_product_id
      and coalesce(mb.kg_total, 0) > 0.00005;

    select coalesce(sum(m.quantity_kg), 0)
    into v_sold
    from public.stock_movements m
    where m.season_id = p_season_id
      and m.product_id = p_product_id
      and m.is_cancelled = false
      and m.to_kind = 'sale';
  else
    -- Warehouse: type-only uses balances; supplier filter uses attributed in/out
    if p_supplier_id is null then
      select coalesce(sum(wb.kg_total), 0)
      into v_warehouse
      from public.warehouse_balances(p_season_id) wb
      where wb.product_id = p_product_id
        and (p_account_type_id is null or wb.account_type_id = p_account_type_id)
        and coalesce(wb.kg_total, 0) > 0.00005;
    else
      with
      wh_del_in as (
        select
          d.warehouse_id as id,
          sum(d.quantity_kg)::numeric as kg
        from public.warehouse_deliveries d
        join public.warehouses w on w.id = d.warehouse_id
        where d.season_id = p_season_id
          and d.product_id = p_product_id
          and d.is_cancelled = false
          and d.destination_kind = 'warehouse'
          and d.warehouse_id is not null
          and coalesce(d.quantity_kg, 0) > 0
          and (p_account_type_id is null or w.account_type_id = p_account_type_id)
        group by d.warehouse_id
      ),
      wh_typed_in as (
        select
          d.warehouse_id as id,
          sum(d.quantity_kg)::numeric as kg
        from public.warehouse_deliveries d
        join public.warehouses w on w.id = d.warehouse_id
        join public.suppliers s on s.id = d.supplier_id
        where d.season_id = p_season_id
          and d.product_id = p_product_id
          and d.is_cancelled = false
          and d.destination_kind = 'warehouse'
          and d.warehouse_id is not null
          and coalesce(d.quantity_kg, 0) > 0
          and (p_account_type_id is null or w.account_type_id = p_account_type_id)
          and d.supplier_id = p_supplier_id
          and (p_account_type_id is null or s.account_type_id = p_account_type_id)
        group by d.warehouse_id
      ),
      wh_mov_in as (
        select
          sec.warehouse_id as id,
          sum(m.quantity_kg)::numeric as kg
        from public.stock_movements m
        join public.warehouse_sections sec on sec.id = m.to_id
        join public.warehouses w on w.id = sec.warehouse_id
        where m.season_id = p_season_id
          and m.product_id = p_product_id
          and m.is_cancelled = false
          and m.to_kind = 'section'
          and coalesce(m.quantity_kg, 0) > 0
          and (p_account_type_id is null or w.account_type_id = p_account_type_id)
        group by sec.warehouse_id
      ),
      wh_total_in as (
        select id, sum(kg) as kg
        from (
          select id, kg from wh_del_in
          union all
          select id, kg from wh_mov_in
        ) u
        group by id
      ),
      wh_total_out as (
        select
          sec.warehouse_id as id,
          sum(m.quantity_kg)::numeric as kg
        from public.stock_movements m
        join public.warehouse_sections sec on sec.id = m.from_id
        join public.warehouses w on w.id = sec.warehouse_id
        where m.season_id = p_season_id
          and m.product_id = p_product_id
          and m.is_cancelled = false
          and m.from_kind = 'section'
          and coalesce(m.quantity_kg, 0) > 0
          and (p_account_type_id is null or w.account_type_id = p_account_type_id)
        group by sec.warehouse_id
      ),
      wh_ids as (
        select id from wh_typed_in
        union
        select id from wh_total_out
      )
      select coalesce(sum(
        greatest(
          0::numeric,
          ti.kg - coalesce(tout.kg, 0) * case
            when coalesce(tin.kg, 0) > 0.00005 then least(1::numeric, ti.kg / tin.kg)
            else 1::numeric
          end
        )
      ), 0)
      into v_warehouse
      from wh_ids i
      join wh_typed_in ti on ti.id = i.id
      left join wh_total_in tin on tin.id = i.id
      left join wh_total_out tout on tout.id = i.id
      where ti.kg > 0.00005;
    end if;

    -- Section delivery shares (for store/mekla/sale attribution)
    with
    section_delivery_total as (
      select
        d.section_id as id,
        sum(d.quantity_kg)::numeric as kg
      from public.warehouse_deliveries d
      where d.season_id = p_season_id
        and d.product_id = p_product_id
        and d.is_cancelled = false
        and d.destination_kind = 'warehouse'
        and d.section_id is not null
        and coalesce(d.quantity_kg, 0) > 0
      group by d.section_id
    ),
    section_delivery_matched as (
      select
        d.section_id as id,
        sum(d.quantity_kg)::numeric as kg
      from public.warehouse_deliveries d
      join public.suppliers s on s.id = d.supplier_id
      where d.season_id = p_season_id
        and d.product_id = p_product_id
        and d.is_cancelled = false
        and d.destination_kind = 'warehouse'
        and d.section_id is not null
        and coalesce(d.quantity_kg, 0) > 0
        and (p_supplier_id is null or d.supplier_id = p_supplier_id)
        and (p_account_type_id is null or s.account_type_id = p_account_type_id)
      group by d.section_id
    ),
    section_share as (
      select
        sec.id,
        case
          when p_account_type_id is not null
            and w.account_type_id is distinct from p_account_type_id
            then 0::numeric
          when p_supplier_id is null then 1::numeric
          when coalesce(tot.kg, 0) <= 0.00005 then 0::numeric
          else least(1::numeric, coalesce(mat.kg, 0) / tot.kg)
        end as share
      from public.warehouse_sections sec
      left join public.warehouses w on w.id = sec.warehouse_id
      left join section_delivery_total tot on tot.id = sec.id
      left join section_delivery_matched mat on mat.id = sec.id
    ),
    -- Store inflows
    store_del_total as (
      select
        d.store_id as id,
        sum(d.quantity_kg)::numeric as kg
      from public.warehouse_deliveries d
      where d.season_id = p_season_id
        and d.product_id = p_product_id
        and d.is_cancelled = false
        and d.destination_kind = 'store'
        and d.store_id is not null
        and coalesce(d.quantity_kg, 0) > 0
      group by d.store_id
    ),
    store_del_typed as (
      select
        d.store_id as id,
        sum(d.quantity_kg)::numeric as kg
      from public.warehouse_deliveries d
      join public.suppliers s on s.id = d.supplier_id
      where d.season_id = p_season_id
        and d.product_id = p_product_id
        and d.is_cancelled = false
        and d.destination_kind = 'store'
        and d.store_id is not null
        and coalesce(d.quantity_kg, 0) > 0
        and (p_supplier_id is null or d.supplier_id = p_supplier_id)
        and (p_account_type_id is null or s.account_type_id = p_account_type_id)
      group by d.store_id
    ),
    store_mov_total_in as (
      select
        m.to_id as id,
        sum(m.quantity_kg)::numeric as kg
      from public.stock_movements m
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.to_kind = 'store'
        and coalesce(m.quantity_kg, 0) > 0
      group by m.to_id
    ),
    store_mov_typed_in as (
      select
        m.to_id as id,
        sum(m.quantity_kg * coalesce(ss.share, 0))::numeric as kg
      from public.stock_movements m
      join section_share ss on ss.id = m.from_id
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.to_kind = 'store'
        and m.from_kind = 'section'
        and coalesce(m.quantity_kg, 0) > 0
        and coalesce(ss.share, 0) > 0
      group by m.to_id
    ),
    store_total_in as (
      select id, sum(kg) as kg
      from (
        select id, kg from store_del_total
        union all
        select id, kg from store_mov_total_in
      ) u
      group by id
    ),
    store_typed_in as (
      select id, sum(kg) as kg
      from (
        select id, kg from store_del_typed
        union all
        select id, kg from store_mov_typed_in
      ) u
      group by id
    ),
    store_total_out as (
      select
        m.from_id as id,
        sum(m.quantity_kg)::numeric as kg
      from public.stock_movements m
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.from_kind = 'store'
        and coalesce(m.quantity_kg, 0) > 0
      group by m.from_id
    ),
    store_share as (
      select
        ti.id,
        case
          when coalesce(tot.kg, 0) <= 0.00005 then 0::numeric
          else least(1::numeric, ti.kg / tot.kg)
        end as share,
        ti.kg as typed_kg,
        coalesce(tot.kg, 0) as total_kg,
        coalesce(tout.kg, 0) as out_kg
      from store_typed_in ti
      left join store_total_in tot on tot.id = ti.id
      left join store_total_out tout on tout.id = ti.id
    ),
    store_balance as (
      select coalesce(sum(
        greatest(
          0::numeric,
          typed_kg - out_kg * case
            when total_kg > 0.00005 then least(1::numeric, typed_kg / total_kg)
            else 1::numeric
          end
        )
      ), 0) as kg
      from store_share
      where typed_kg > 0.00005
    ),
    -- Mekla inflows (typed via section share or store share)
    mekla_total_in as (
      select
        m.to_id as id,
        sum(m.quantity_kg)::numeric as kg
      from public.stock_movements m
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.to_kind = 'mekla'
        and coalesce(m.quantity_kg, 0) > 0
      group by m.to_id
    ),
    mekla_typed_from_section as (
      select
        m.to_id as id,
        sum(m.quantity_kg * coalesce(ss.share, 0))::numeric as kg
      from public.stock_movements m
      join section_share ss on ss.id = m.from_id
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.to_kind = 'mekla'
        and m.from_kind = 'section'
        and coalesce(m.quantity_kg, 0) > 0
        and coalesce(ss.share, 0) > 0
      group by m.to_id
    ),
    mekla_typed_from_store as (
      select
        m.to_id as id,
        sum(m.quantity_kg * coalesce(st.share, 0))::numeric as kg
      from public.stock_movements m
      join store_share st on st.id = m.from_id
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.to_kind = 'mekla'
        and m.from_kind = 'store'
        and coalesce(m.quantity_kg, 0) > 0
        and coalesce(st.share, 0) > 0
      group by m.to_id
    ),
    mekla_typed_in as (
      select id, sum(kg) as kg
      from (
        select id, kg from mekla_typed_from_section
        union all
        select id, kg from mekla_typed_from_store
      ) u
      group by id
    ),
    mekla_total_out as (
      select
        m.from_id as id,
        sum(m.quantity_kg)::numeric as kg
      from public.stock_movements m
      where m.season_id = p_season_id
        and m.product_id = p_product_id
        and m.is_cancelled = false
        and m.from_kind = 'mekla'
        and coalesce(m.quantity_kg, 0) > 0
      group by m.from_id
    ),
    mekla_share as (
      select
        ti.id,
        case
          when coalesce(tot.kg, 0) <= 0.00005 then 0::numeric
          else least(1::numeric, ti.kg / tot.kg)
        end as share,
        ti.kg as typed_kg,
        coalesce(tot.kg, 0) as total_kg,
        coalesce(tout.kg, 0) as out_kg
      from mekla_typed_in ti
      left join mekla_total_in tot on tot.id = ti.id
      left join mekla_total_out tout on tout.id = ti.id
    ),
    mekla_balance as (
      select coalesce(sum(
        greatest(
          0::numeric,
          typed_kg - out_kg * case
            when total_kg > 0.00005 then least(1::numeric, typed_kg / total_kg)
            else 1::numeric
          end
        )
      ), 0) as kg
      from mekla_share
      where typed_kg > 0.00005
    ),
    sold_calc as (
      select coalesce(sum(x.kg), 0) as kg
      from (
        select m.quantity_kg * coalesce(ss.share, 0) as kg
        from public.stock_movements m
        join section_share ss on ss.id = m.from_id
        where m.season_id = p_season_id
          and m.product_id = p_product_id
          and m.is_cancelled = false
          and m.to_kind = 'sale'
          and m.from_kind = 'section'
          and coalesce(m.quantity_kg, 0) > 0
        union all
        select m.quantity_kg * coalesce(st.share, 0)
        from public.stock_movements m
        join store_share st on st.id = m.from_id
        where m.season_id = p_season_id
          and m.product_id = p_product_id
          and m.is_cancelled = false
          and m.to_kind = 'sale'
          and m.from_kind = 'store'
          and coalesce(m.quantity_kg, 0) > 0
        union all
        select m.quantity_kg * coalesce(ms.share, 0)
        from public.stock_movements m
        join mekla_share ms on ms.id = m.from_id
        where m.season_id = p_season_id
          and m.product_id = p_product_id
          and m.is_cancelled = false
          and m.to_kind = 'sale'
          and m.from_kind = 'mekla'
          and coalesce(m.quantity_kg, 0) > 0
      ) x
    )
    select
      (select kg from store_balance),
      (select kg from mekla_balance),
      (select kg from sold_calc)
    into v_store, v_mekla, v_sold;
  end if;

  v_purchased := round(v_purchased, 2);
  v_delivered := round(v_delivered, 2);
  v_remaining := round(v_purchased - v_delivered, 2);
  if abs(v_remaining) < 0.005 then
    v_remaining := 0;
  end if;
  v_warehouse := round(coalesce(v_warehouse, 0), 2);
  v_store := round(coalesce(v_store, 0), 2);
  v_mekla := round(coalesce(v_mekla, 0), 2);
  v_sold := round(coalesce(v_sold, 0), 2);

  return query select
    v_purchased,
    v_delivered,
    v_remaining,
    v_warehouse,
    v_store,
    v_mekla,
    v_sold;
end;
$$;

grant execute on function public.dashboard_quantity_flow(uuid, uuid, uuid, uuid) to authenticated;
