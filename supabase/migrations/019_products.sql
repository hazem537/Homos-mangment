-- Multi-product (أنواع الحمص): products master + product_id on quantity flows

-- 1) Products master
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0)
);

create unique index products_name_unique
  on public.products (lower(trim(name)));

create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy "Authenticated can read products"
  on public.products for select to authenticated using (true);
create policy "Authenticated can insert products"
  on public.products for insert to authenticated with check (true);
create policy "Authenticated can update products"
  on public.products for update to authenticated using (true);
create policy "Authenticated can delete products"
  on public.products for delete to authenticated using (true);

-- Seed default product
insert into public.products (name, notes)
select 'حمص خام', 'الصنف الافتراضي'
where not exists (
  select 1 from public.products p where lower(trim(p.name)) = 'حمص خام'
);

-- 2) Add product_id columns (nullable first for backfill)
alter table public.purchases
  add column if not exists product_id uuid references public.products (id);

alter table public.warehouse_deliveries
  add column if not exists product_id uuid references public.products (id);

alter table public.stock_movements
  add column if not exists product_id uuid references public.products (id);

-- Backfill
update public.purchases
set product_id = (select id from public.products where lower(trim(name)) = 'حمص خام' limit 1)
where product_id is null;

update public.warehouse_deliveries
set product_id = (select id from public.products where lower(trim(name)) = 'حمص خام' limit 1)
where product_id is null;

update public.stock_movements
set product_id = (select id from public.products where lower(trim(name)) = 'حمص خام' limit 1)
where product_id is null;

alter table public.purchases
  alter column product_id set not null;

alter table public.warehouse_deliveries
  alter column product_id set not null;

alter table public.stock_movements
  alter column product_id set not null;

create index if not exists purchases_product_idx on public.purchases (product_id);
create index if not exists warehouse_deliveries_product_idx on public.warehouse_deliveries (product_id);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id);

-- 3) location_remaining_kg — per product
drop function if exists public.location_remaining_kg(public.stock_location_kind, uuid, uuid);

create or replace function public.location_remaining_kg(
  p_kind public.stock_location_kind,
  p_id uuid,
  p_product_id uuid,
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
    where p_kind = 'section'
      and d.section_id = p_id
      and d.product_id = p_product_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
  ),
  moved_in as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.to_kind = p_kind
      and m.to_id = p_id
      and m.product_id = p_product_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  moved_out as (
    select coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg
    from public.stock_movements m
    where m.from_kind = p_kind
      and m.from_id = p_id
      and m.product_id = p_product_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select (
    case when p_kind = 'section' then coalesce((select kg from inbound), 0) else 0 end
    + coalesce((select kg from moved_in), 0)
    - coalesce((select kg from moved_out), 0)
  )::numeric(14, 3);
$$;

grant execute on function public.location_remaining_kg(
  public.stock_location_kind, uuid, uuid, uuid
) to authenticated;

-- 4) Movement remaining check uses product_id
create or replace function public.check_stock_movement_remaining()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining numeric(14, 3);
begin
  if new.is_cancelled then
    return new;
  end if;

  v_remaining := public.location_remaining_kg(
    new.from_kind,
    new.from_id,
    new.product_id,
    new.season_id
  );

  if tg_op = 'UPDATE' and not old.is_cancelled
     and old.product_id = new.product_id
     and old.from_kind = new.from_kind
     and old.from_id = new.from_id
     and old.season_id = new.season_id then
    v_remaining := v_remaining + old.quantity_kg;
  end if;

  if new.quantity_kg > v_remaining + 0.001 then
    raise exception 'الكمية أكبر من الرصيد المتاح (% كجم)', v_remaining;
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movements_remaining_check on public.stock_movements;
create trigger stock_movements_remaining_check
  before insert or update of quantity_kg, from_kind, from_id, product_id, season_id, is_cancelled
  on public.stock_movements
  for each row execute function public.check_stock_movement_remaining();

-- 5) section_balances — one row per section × product
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
  products_used as (
    select distinct d.section_id, d.product_id
    from public.warehouse_deliveries d
    where d.warehouse_id = p_warehouse_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
    union
    select distinct m.from_id, m.product_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.to_id, m.product_id
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
      coalesce(pu.product_id, def.id) as product_id
    from public.warehouse_sections sec
    left join products_used pu on pu.section_id = sec.id
    cross join lateral (
      select p.id from public.products p where p.is_active = true order by p.name limit 1
    ) def
    where sec.warehouse_id = p_warehouse_id
      and sec.is_active = true
  ),
  in_agg as (
    select
      d.section_id,
      d.product_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.warehouse_id = p_warehouse_id
      and d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.section_id, d.product_id
  ),
  out_agg as (
    select
      m.from_id as section_id,
      m.product_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.from_id, m.product_id
  ),
  back_in as (
    select
      m.to_id as section_id,
      m.product_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and sec.warehouse_id = p_warehouse_id
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by m.to_id, m.product_id
  )
  select distinct on (pr.section_id, pr.product_id)
    pr.section_id,
    pr.section_name,
    pr.product_id,
    prod.name as product_name,
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
  join public.products prod on prod.id = pr.product_id
  left join in_agg ia on ia.section_id = pr.section_id and ia.product_id = pr.product_id
  left join out_agg oa on oa.section_id = pr.section_id and oa.product_id = pr.product_id
  left join back_in bi on bi.section_id = pr.section_id and bi.product_id = pr.product_id
  order by pr.section_id, pr.product_id, pr.section_name, prod.name;
$$;

grant execute on function public.section_balances(uuid, uuid) to authenticated;

-- 6) warehouse_balances — one row per warehouse × product
drop function if exists public.warehouse_balances(uuid);

create or replace function public.warehouse_balances(p_season_id uuid default null)
returns table (
  warehouse_id uuid,
  warehouse_name text,
  product_id uuid,
  product_name text,
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
    select distinct d.warehouse_id, d.product_id
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    union
    select distinct sec.warehouse_id, m.product_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct sec.warehouse_id, m.product_id
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  ),
  delivery_agg as (
    select
      d.warehouse_id,
      d.product_id,
      coalesce(sum(d.quantity_kg), 0)::numeric(14, 3) as kg_in
    from public.warehouse_deliveries d
    where d.season_id = (select id from season)
      and d.is_cancelled = false
    group by d.warehouse_id, d.product_id
  ),
  out_agg as (
    select
      sec.warehouse_id,
      m.product_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_out
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.from_id
    where m.from_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id, m.product_id
  ),
  back_agg as (
    select
      sec.warehouse_id,
      m.product_id,
      coalesce(sum(m.quantity_kg), 0)::numeric(14, 3) as kg_back
    from public.stock_movements m
    join public.warehouse_sections sec on sec.id = m.to_id
    where m.to_kind = 'section'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    group by sec.warehouse_id, m.product_id
  )
  select
    w.id as warehouse_id,
    w.name as warehouse_name,
    coalesce(pr.product_id, def.id) as product_id,
    prod.name as product_name,
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
  cross join lateral (
    select p.id from public.products p where p.is_active = true order by p.name limit 1
  ) def
  join public.products prod on prod.id = coalesce(pr.product_id, def.id)
  left join delivery_agg da
    on da.warehouse_id = w.id and da.product_id = coalesce(pr.product_id, def.id)
  left join out_agg oa
    on oa.warehouse_id = w.id and oa.product_id = coalesce(pr.product_id, def.id)
  left join back_agg ba
    on ba.warehouse_id = w.id and ba.product_id = coalesce(pr.product_id, def.id)
  where w.is_active = true
  order by w.name, prod.name;
$$;

grant execute on function public.warehouse_balances(uuid) to authenticated;

-- 7) store_balances / mekla_balances — per product
drop function if exists public.store_balances(uuid);
drop function if exists public.mekla_balances(uuid);

create or replace function public.store_balances(p_season_id uuid default null)
returns table (
  store_id uuid,
  store_name text,
  product_id uuid,
  product_name text,
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
    select distinct m.to_id as store_id, m.product_id
    from public.stock_movements m
    where m.to_kind = 'store'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.from_id, m.product_id
    from public.stock_movements m
    where m.from_kind = 'store'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select
    st.id as store_id,
    st.name as store_name,
    coalesce(pr.product_id, def.id) as product_id,
    prod.name as product_name,
    st.notes,
    st.is_active,
    public.location_remaining_kg(
      'store',
      st.id,
      coalesce(pr.product_id, def.id),
      (select id from season)
    ) as kg_total
  from public.stores st
  left join pairs pr on pr.store_id = st.id
  cross join lateral (
    select p.id from public.products p where p.is_active = true order by p.name limit 1
  ) def
  join public.products prod on prod.id = coalesce(pr.product_id, def.id)
  where st.is_active = true
  order by st.name, prod.name;
$$;

create or replace function public.mekla_balances(p_season_id uuid default null)
returns table (
  mekla_id uuid,
  mekla_name text,
  product_id uuid,
  product_name text,
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
    select distinct m.to_id as mekla_id, m.product_id
    from public.stock_movements m
    where m.to_kind = 'mekla'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
    union
    select distinct m.from_id, m.product_id
    from public.stock_movements m
    where m.from_kind = 'mekla'
      and m.season_id = (select id from season)
      and m.is_cancelled = false
  )
  select
    mk.id as mekla_id,
    mk.name as mekla_name,
    coalesce(pr.product_id, def.id) as product_id,
    prod.name as product_name,
    mk.notes,
    mk.is_active,
    public.location_remaining_kg(
      'mekla',
      mk.id,
      coalesce(pr.product_id, def.id),
      (select id from season)
    ) as kg_total
  from public.meklas mk
  left join pairs pr on pr.mekla_id = mk.id
  cross join lateral (
    select p.id from public.products p where p.is_active = true order by p.name limit 1
  ) def
  join public.products prod on prod.id = coalesce(pr.product_id, def.id)
  where mk.is_active = true
  order by mk.name, prod.name;
$$;

grant execute on function public.store_balances(uuid) to authenticated;
grant execute on function public.mekla_balances(uuid) to authenticated;

-- 8) supplier_balances — one row per supplier × product
-- money totals are supplier-season wide (duplicated on each product row); ardab is per product
drop function if exists public.supplier_due(uuid, uuid);
drop function if exists public.supplier_balances(uuid);

create or replace function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  product_id uuid,
  product_name text,
  notes text,
  is_active boolean,
  account_type public.supplier_account_type,
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
      coalesce(pr.product_id, def.id) as product_id,
      s.notes,
      s.is_active,
      s.account_type,
      coalesce(mp.purchases_total, 0)::numeric(14, 2) as purchases_total,
      coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
      coalesce(ta.commission_total, 0)::numeric(14, 2) as commission_total,
      (coalesce(mp.purchases_total, 0) - coalesce(ta.transfers_total, 0))::numeric(14, 2) as balance,
      coalesce(pp.kg_total, 0)::numeric(14, 3) as kg_total,
      coalesce(pd.kg_delivered, 0)::numeric(14, 3) as kg_delivered,
      coalesce((select ardab_factor from season), 170)::numeric as factor
    from public.suppliers s
    left join pairs pr on pr.supplier_id = s.id
    cross join lateral (
      select p.id from public.products p where p.is_active = true order by p.name limit 1
    ) def
    left join money_purchase mp on mp.supplier_id = s.id
    left join transfer_agg ta on ta.supplier_id = s.id
    left join product_purchase pp
      on pp.supplier_id = s.id and pp.product_id = coalesce(pr.product_id, def.id)
    left join product_delivery pd
      on pd.supplier_id = s.id and pd.product_id = coalesce(pr.product_id, def.id)
    where s.is_active = true
  )
  select
    c.supplier_id,
    c.supplier_name,
    c.product_id,
    prod.name as product_name,
    c.notes,
    c.is_active,
    c.account_type,
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
  join public.products prod on prod.id = c.product_id
  order by c.supplier_name, prod.name;
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
  account_type public.supplier_account_type,
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
    b.account_type,
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

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;

-- 9) purchase_ledger — partition by product
-- Must DROP: CREATE OR REPLACE cannot insert a column mid-list
drop view if exists public.purchase_ledger;

create view public.purchase_ledger
with (security_invoker = true)
as
select
  p.id,
  p.season_id,
  p.supplier_id,
  p.product_id,
  p.purchase_date,
  p.quantity_kg,
  p.ardab,
  p.price_per_ardab,
  p.total_price,
  p.notes,
  p.is_cancelled,
  p.created_at,
  p.updated_at,
  case
    when sum(p.ardab) over w = 0 then 0::numeric
    else round((sum(p.total_price) over w / sum(p.ardab) over w)::numeric, 4)
  end as running_avg_price
from public.purchases p
where p.is_cancelled = false
window w as (
  partition by p.supplier_id, p.season_id, p.product_id
  order by p.purchase_date asc, p.created_at asc
  rows between unbounded preceding and current row
);
