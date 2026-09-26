-- Cash transfers per supplier × product; supplier money balances become product-scoped

-- 1) Add product_id (nullable first for backfill)
alter table public.cash_transfers
  add column if not exists product_id uuid references public.products (id);

-- 2) Backfill: highest-purchase product for that supplier in the transfer's season
--    else first active product by name
with ranked as (
  select
    p.supplier_id,
    p.season_id,
    p.product_id,
    row_number() over (
      partition by p.supplier_id, p.season_id
      order by sum(p.total_price) desc, min(p.created_at) asc
    ) as rn
  from public.purchases p
  where p.is_cancelled = false
  group by p.supplier_id, p.season_id, p.product_id
)
update public.cash_transfers t
set product_id = coalesce(
  (
    select r.product_id
    from ranked r
    where r.supplier_id = t.supplier_id
      and r.season_id = t.season_id
      and r.rn = 1
  ),
  (select id from public.products where is_active = true order by name limit 1)
)
where t.product_id is null;

-- If still null (no products table rows), fail clearly
do $$
begin
  if exists (select 1 from public.cash_transfers where product_id is null) then
    raise exception 'cash_transfers.product_id backfill failed: no products available';
  end if;
end $$;

alter table public.cash_transfers
  alter column product_id set not null;

create index if not exists cash_transfers_supplier_season_product_idx
  on public.cash_transfers (supplier_id, season_id, product_id);

-- 3) supplier_balances — money per supplier × product
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
      p.product_id,
      coalesce(sum(p.total_price), 0)::numeric(14, 2) as purchases_total,
      coalesce(sum(p.quantity_kg), 0)::numeric(14, 3) as kg_total
    from public.purchases p
    where p.season_id = (select id from season)
      and p.is_cancelled = false
    group by p.supplier_id, p.product_id
  ),
  transfer_agg as (
    select
      t.supplier_id,
      t.product_id,
      coalesce(sum(t.amount) filter (where t.kind::text <> 'commission'), 0)::numeric(14, 2) as transfers_total,
      coalesce(sum(t.amount) filter (where t.kind::text = 'commission'), 0)::numeric(14, 2) as commission_total
    from public.cash_transfers t
    where t.season_id = (select id from season)
      and t.is_cancelled = false
    group by t.supplier_id, t.product_id
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
    select supplier_id, product_id from money_purchase
    union
    select supplier_id, product_id from product_delivery
    union
    select supplier_id, product_id from transfer_agg
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
      coalesce(mp.kg_total, 0)::numeric(14, 3) as kg_total,
      coalesce(pd.kg_delivered, 0)::numeric(14, 3) as kg_delivered,
      coalesce((select ardab_factor from season), 170)::numeric as factor
    from public.suppliers s
    left join pairs pr on pr.supplier_id = s.id
    left join money_purchase mp
      on mp.supplier_id = s.id and mp.product_id is not distinct from pr.product_id
    left join transfer_agg ta
      on ta.supplier_id = s.id and ta.product_id is not distinct from pr.product_id
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

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_due(uuid, uuid) to authenticated;
