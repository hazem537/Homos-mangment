-- Remove ملاحظات (notes) from warehouse_sections (ربع schema).
-- Recreate dependent RPCs without notes, then drop the column.

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
    insert into public.warehouse_sections (warehouse_id, name)
    values (new.id, 'عام');
  end if;
  return new;
end;
$$;

drop function if exists public.section_balances(uuid, uuid);

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
    select distinct m.to_id, m.product_id, m.to_status_id
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
    select m.to_id as section_id, m.product_id, m.to_status_id as status_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.to_id, m.product_id, m.to_status_id
  )
  select distinct on (pr.section_id, pr.product_id, pr.status_id)
    pr.section_id,
    pr.section_name,
    pr.product_id,
    prod.name as product_name,
    pr.status_id,
    st.name as status_name,
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

grant execute on function public.section_balances(uuid, uuid) to authenticated;

create or replace function public.warehouse_detail_bundle(
  p_warehouse_id uuid,
  p_season_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_season_id uuid;
  v_season_name text;
  v_result jsonb;
begin
  if p_warehouse_id is null then
    return jsonb_build_object('error', 'warehouse_id required');
  end if;

  select s.id, s.name
  into v_season_id, v_season_name
  from public.seasons s
  where s.id = coalesce(
    p_season_id,
    (select a.id from public.seasons a where a.is_active = true limit 1)
  );

  if v_season_id is null then
    return jsonb_build_object(
      'warehouse', null,
      'account_type_name', null,
      'season', null,
      'sections', '[]'::jsonb,
      'balances', '[]'::jsonb,
      'deliveries', '[]'::jsonb,
      'movements_out', '[]'::jsonb,
      'movements_in', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'warehouse', (
      select to_jsonb(w.*)
      from public.warehouses w
      where w.id = p_warehouse_id
    ),
    'account_type_name', (
      select at.name
      from public.warehouses w
      join public.account_types at on at.id = w.account_type_id
      where w.id = p_warehouse_id
    ),
    'season', jsonb_build_object('id', v_season_id, 'name', v_season_name),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'is_active', s.is_active
        )
        order by s.name
      )
      from public.warehouse_sections s
      where s.warehouse_id = p_warehouse_id
        and s.is_active = true
    ), '[]'::jsonb),
    'balances', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.section_name, b.product_name, b.status_name)
      from public.section_balances(p_warehouse_id, v_season_id) b
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'section_id', d.section_id,
          'product_id', d.product_id,
          'status_id', d.status_id,
          'delivery_date', d.delivery_date,
          'created_at', d.created_at,
          'quantity_kg', d.quantity_kg,
          'supplier_name', coalesce(sup.name, 'تسليم')
        )
        order by d.delivery_date, d.created_at
      )
      from public.warehouse_deliveries d
      left join public.suppliers sup on sup.id = d.supplier_id
      where d.warehouse_id = p_warehouse_id
        and d.season_id = v_season_id
        and d.is_cancelled = false
    ), '[]'::jsonb),
    'movements_out', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'from_id', m.from_id,
          'product_id', m.product_id,
          'status_id', m.status_id,
          'to_status_id', m.to_status_id,
          'movement_date', m.movement_date,
          'created_at', m.created_at,
          'quantity_kg', m.quantity_kg,
          'notes', m.notes,
          'from_kind', m.from_kind,
          'to_kind', m.to_kind,
          'to_id', m.to_id,
          'status_name', st.name,
          'to_status_name', tst.name,
          'destination', public.stock_location_label(m.to_kind, m.to_id, p_warehouse_id)
        )
        order by m.movement_date, m.created_at
      )
      from public.stock_movements m
      join public.warehouse_sections sec on sec.id = m.from_id
      left join public.stock_statuses st on st.id = m.status_id
      left join public.stock_statuses tst on tst.id = m.to_status_id
      where m.from_kind = 'section'
        and sec.warehouse_id = p_warehouse_id
        and m.season_id = v_season_id
        and m.is_cancelled = false
    ), '[]'::jsonb),
    'movements_in', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'to_id', m.to_id,
          'product_id', m.product_id,
          'status_id', m.to_status_id,
          'to_status_id', m.to_status_id,
          'movement_date', m.movement_date,
          'created_at', m.created_at,
          'quantity_kg', m.quantity_kg,
          'notes', m.notes,
          'from_kind', m.from_kind,
          'from_id', m.from_id,
          'to_kind', m.to_kind,
          'source', public.stock_location_label(m.from_kind, m.from_id, p_warehouse_id)
        )
        order by m.movement_date, m.created_at
      )
      from public.stock_movements m
      join public.warehouse_sections sec on sec.id = m.to_id
      where m.to_kind = 'section'
        and sec.warehouse_id = p_warehouse_id
        and m.season_id = v_season_id
        and m.is_cancelled = false
    ), '[]'::jsonb)
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object('error', 'warehouse not found'));
end;
$$;

grant execute on function public.warehouse_detail_bundle(uuid, uuid) to authenticated;

alter table public.warehouse_sections
  drop column if exists notes;
