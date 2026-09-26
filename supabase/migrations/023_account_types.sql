-- Editable account types (replace supplier_account_type enum)
-- Uniqueness: active (name, account_type_id) for suppliers & warehouses
-- Enforce delivery: supplier.account_type_id = warehouse.account_type_id

create table if not exists public.account_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_types_active_name_unique
  on public.account_types (lower(trim(name)))
  where is_active = true;

alter table public.account_types enable row level security;

drop policy if exists account_types_select_authenticated on public.account_types;
create policy account_types_select_authenticated
  on public.account_types for select to authenticated using (true);

drop policy if exists account_types_write_authenticated on public.account_types;
create policy account_types_write_authenticated
  on public.account_types for all to authenticated using (true) with check (true);

-- Seed the three legacy enum labels (idempotent by name)
insert into public.account_types (name, notes)
select v.name, v.notes
from (values
  ('عادي', 'النوع الافتراضي'),
  ('استثمار', null::text),
  ('شركة', null::text)
) as v(name, notes)
where not exists (
  select 1 from public.account_types t
  where lower(trim(t.name)) = lower(trim(v.name))
);

-- Add FK columns
alter table public.suppliers
  add column if not exists account_type_id uuid references public.account_types (id);

alter table public.warehouses
  add column if not exists account_type_id uuid references public.account_types (id);

-- Backfill from enum if still present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'account_type'
  ) then
    update public.suppliers s
    set account_type_id = t.id
    from public.account_types t
    where s.account_type_id is null
      and (
        (s.account_type::text = 'normal' and lower(trim(t.name)) = 'عادي')
        or (s.account_type::text = 'investment' and lower(trim(t.name)) = 'استثمار')
        or (s.account_type::text = 'company' and lower(trim(t.name)) = 'شركة')
      );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'warehouses' and column_name = 'account_type'
  ) then
    update public.warehouses w
    set account_type_id = t.id
    from public.account_types t
    where w.account_type_id is null
      and (
        (w.account_type::text = 'normal' and lower(trim(t.name)) = 'عادي')
        or (w.account_type::text = 'investment' and lower(trim(t.name)) = 'استثمار')
        or (w.account_type::text = 'company' and lower(trim(t.name)) = 'شركة')
      );
  end if;
end $$;

-- Any leftover nulls → عادي
update public.suppliers
set account_type_id = (
  select id from public.account_types where lower(trim(name)) = 'عادي' and is_active limit 1
)
where account_type_id is null;

update public.warehouses
set account_type_id = (
  select id from public.account_types where lower(trim(name)) = 'عادي' and is_active limit 1
)
where account_type_id is null;

alter table public.suppliers
  alter column account_type_id set not null;

alter table public.warehouses
  alter column account_type_id set not null;

create index if not exists suppliers_account_type_idx on public.suppliers (account_type_id);
create index if not exists warehouses_account_type_idx on public.warehouses (account_type_id);

-- Name uniqueness: name + type among active rows
drop index if exists public.suppliers_active_name_unique;
drop index if exists public.suppliers_name_unique;
create unique index suppliers_active_name_type_unique
  on public.suppliers (lower(trim(name)), account_type_id)
  where is_active = true;

drop index if exists public.warehouses_active_name_unique;
drop index if exists public.warehouses_name_unique;
create unique index warehouses_active_name_type_unique
  on public.warehouses (lower(trim(name)), account_type_id)
  where is_active = true;

-- Drop enum columns (RPCs that reference them are recreated below)
alter table public.suppliers drop column if exists account_type;
alter table public.warehouses drop column if exists account_type;

-- Delivery type match
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
  before insert or update of supplier_id, warehouse_id
  on public.warehouse_deliveries
  for each row execute function public.enforce_delivery_account_type_match();

-- Recreate balance RPCs with account_type_id + account_type_name
drop function if exists public.supplier_due(uuid, uuid);
drop function if exists public.supplier_balances(uuid);
drop function if exists public.warehouse_balances(uuid);

create or replace function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  product_id uuid,
  product_name text,
  notes text,
  is_active boolean,
  account_type_id uuid,
  account_type_name text,
  purchases_total numeric,
  transfers_total numeric,
  commission_total numeric,
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
  money_purchase as (
    select
      p.supplier_id,
      coalesce(sum(p.total_price), 0)::numeric(14, 2) as purchases_total
    from public.purchases p
    where p.season_id = (select id from season)
      and p.is_cancelled = false
    group by p.supplier_id
  ),
  transfer_agg as (
    select
      t.supplier_id,
      coalesce(sum(t.amount) filter (where t.kind::text <> 'commission'), 0)::numeric(14, 2) as transfers_total,
      coalesce(sum(t.amount) filter (where t.kind::text = 'commission'), 0)::numeric(14, 2) as commission_total
    from public.cash_transfers t
    where t.season_id = (select id from season)
      and t.is_cancelled = false
    group by t.supplier_id
  ),
  product_purchase as (
    select
      p.supplier_id,
      p.product_id,
      coalesce(sum(p.quantity_kg), 0)::numeric(14, 3) as kg_total
    from public.purchases p
    where p.season_id = (select id from season)
      and p.is_cancelled = false
    group by p.supplier_id, p.product_id
  ),
  product_delivery as (
    select
      d.supplier_id,
      d.product_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_delivered
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.supplier_id, d.product_id
  ),
  pairs as (
    select supplier_id, product_id from product_purchase
    union
    select supplier_id, product_id from product_delivery
  ),
  calc as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      pr.product_id,
      s.notes,
      s.is_active,
      s.account_type_id,
      coalesce(mp.purchases_total, 0)::numeric(14, 2) as purchases_total,
      coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
      coalesce(ta.commission_total, 0)::numeric(14, 2) as commission_total,
      (coalesce(mp.purchases_total, 0) - coalesce(ta.transfers_total, 0))::numeric(14, 2) as balance,
      coalesce(pp.kg_total, 0)::numeric(14, 3) as kg_total,
      coalesce(pd.kg_delivered, 0)::numeric(14, 3) as kg_delivered,
      coalesce((select ardab_factor from season), 170)::numeric as factor
    from public.suppliers s
    left join pairs pr on pr.supplier_id = s.id
    left join money_purchase mp on mp.supplier_id = s.id
    left join transfer_agg ta on ta.supplier_id = s.id
    left join product_purchase pp
      on pp.supplier_id = s.id and pp.product_id is not distinct from pr.product_id
    left join product_delivery pd
      on pd.supplier_id = s.id and pd.product_id is not distinct from pr.product_id
    where s.is_active = true
  )
  select
    c.supplier_id,
    c.supplier_name,
    c.product_id,
    prod.name as product_name,
    c.notes,
    c.is_active,
    c.account_type_id,
    at.name as account_type_name,
    c.purchases_total,
    c.transfers_total,
    c.commission_total,
    c.balance,
    (c.kg_total / nullif(c.factor, 0))::numeric(14, 4) as ardab_total,
    (c.kg_delivered / nullif(c.factor, 0))::numeric(14, 4) as ardab_delivered,
    case
      when abs((c.kg_total - c.kg_delivered) / nullif(c.factor, 0)) < 0.00005 then 0::numeric(14, 4)
      else ((c.kg_total - c.kg_delivered) / nullif(c.factor, 0))::numeric(14, 4)
    end as ardab_remaining
  from calc c
  join public.account_types at on at.id = c.account_type_id
  left join public.products prod on prod.id = c.product_id
  order by c.supplier_name, at.name, prod.name nulls first;
$$;

create or replace function public.supplier_due(
  p_supplier_id uuid,
  p_season_id uuid default null
)
returns table (
  supplier_id uuid,
  supplier_name text,
  product_id uuid,
  product_name text,
  account_type_id uuid,
  account_type_name text,
  purchases_total numeric,
  transfers_total numeric,
  commission_total numeric,
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
    b.product_id,
    b.product_name,
    b.account_type_id,
    b.account_type_name,
    b.purchases_total,
    b.transfers_total,
    b.commission_total,
    b.balance,
    b.ardab_total,
    b.ardab_delivered,
    b.ardab_remaining
  from public.supplier_balances(p_season_id) b
  where b.supplier_id = p_supplier_id;
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

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;
grant execute on function public.warehouse_balances(uuid) to authenticated;

-- Drop unused enum if nothing references it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and udt_name = 'supplier_account_type'
  ) then
    drop type if exists public.supplier_account_type;
  end if;
end $$;
