-- Allow supplier deliveries to go directly to a store (or keep warehouse/section)

alter table public.warehouse_deliveries
  add column if not exists destination_kind text not null default 'warehouse';

alter table public.warehouse_deliveries
  add column if not exists store_id uuid references public.stores (id) on delete restrict;

alter table public.warehouse_deliveries
  alter column warehouse_id drop not null;

alter table public.warehouse_deliveries
  alter column section_id drop not null;

update public.warehouse_deliveries
set destination_kind = 'warehouse'
where destination_kind is distinct from 'warehouse'
  and warehouse_id is not null
  and section_id is not null;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_destination_check;

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_destination_check check (
    (
      destination_kind = 'warehouse'
      and warehouse_id is not null
      and section_id is not null
      and store_id is null
    )
    or (
      destination_kind = 'store'
      and store_id is not null
      and warehouse_id is null
      and section_id is null
    )
  );

create index if not exists warehouse_deliveries_store_idx
  on public.warehouse_deliveries (store_id)
  where store_id is not null;

create index if not exists warehouse_deliveries_destination_idx
  on public.warehouse_deliveries (destination_kind);

-- Section belongs to warehouse — only for warehouse destinations
create or replace function public.check_delivery_section_warehouse()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_warehouse_id uuid;
begin
  if coalesce(new.destination_kind, 'warehouse') = 'store' then
    if new.store_id is null then
      raise exception 'المخزن مطلوب لتسليم المخزن';
    end if;
    return new;
  end if;

  if new.section_id is null or new.warehouse_id is null then
    raise exception 'الشونة والربع مطلوبان لتسليم الشونة';
  end if;

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
  before insert or update of section_id, warehouse_id, store_id, destination_kind
  on public.warehouse_deliveries
  for each row execute function public.check_delivery_section_warehouse();

-- Account type match — warehouse destinations only
create or replace function public.enforce_delivery_account_type_match()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  supplier_type uuid;
  warehouse_type uuid;
begin
  if coalesce(new.destination_kind, 'warehouse') = 'store' then
    return new;
  end if;

  select s.account_type_id into supplier_type
  from public.suppliers s where s.id = new.supplier_id;

  select w.account_type_id into warehouse_type
  from public.warehouses w where w.id = new.warehouse_id;

  if supplier_type is null or warehouse_type is null then
    raise exception 'نوع الحساب غير موجود للمورد أو الشونة';
  end if;

  if supplier_type <> warehouse_type then
    raise exception 'نوع المورد يجب أن يطابق نوع الشونة';
  end if;

  return new;
end;
$$;

drop trigger if exists warehouse_deliveries_account_type_match on public.warehouse_deliveries;
create trigger warehouse_deliveries_account_type_match
  before insert or update of supplier_id, warehouse_id, destination_kind
  on public.warehouse_deliveries
  for each row execute function public.enforce_delivery_account_type_match();

-- Store remaining kg includes direct supplier deliveries
create or replace function public.location_remaining_kg(
  p_kind public.stock_location_kind,
  p_id uuid,
  p_product_id uuid,
  p_status_id uuid,
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
    where d.product_id = p_product_id
      and d.status_id = p_status_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
      and (
        (p_kind = 'section' and d.section_id = p_id)
        or (
          p_kind = 'store'
          and d.destination_kind = 'store'
          and d.store_id = p_id
        )
      )
  ),
  moved_in as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.to_kind = p_kind
      and m.to_id = p_id
      and m.product_id = p_product_id
      and m.status_id = p_status_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  moved_out as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.from_kind = p_kind
      and m.from_id = p_id
      and m.product_id = p_product_id
      and m.status_id = p_status_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select (
    case
      when p_kind in ('section', 'store') then coalesce((select kg from inbound), 0)
      else 0
    end
    + coalesce((select kg from moved_in), 0)
    - coalesce((select kg from moved_out), 0)
  )::numeric(14, 3);
$$;

grant execute on function public.location_remaining_kg(
  public.stock_location_kind, uuid, uuid, uuid, uuid
) to authenticated;

-- store_balances pairs include direct deliveries
drop function if exists public.store_balances(uuid);

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
    union
    select distinct d.store_id, d.product_id, d.status_id
    from public.warehouse_deliveries d
    where d.destination_kind = 'store'
      and d.store_id is not null
      and d.season_id = (select id from season)
      and d.is_cancelled = false
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

grant execute on function public.store_balances(uuid) to authenticated;
