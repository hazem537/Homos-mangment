-- Supplier profile = name + account_type + product
-- Split multi-product suppliers into one row per product; scope detail RPC by product.

-- 0) Drop old uniqueness before cloning same name+type for other products
drop index if exists public.suppliers_active_name_type_unique;

-- 1) Add product_id (nullable for backfill)
alter table public.suppliers
  add column if not exists product_id uuid references public.products (id);

-- 2) Backfill / split multi-product suppliers
do $$
declare
  r record;
  v_new_id uuid;
  v_default_product uuid;
  v_products uuid[];
  v_pid uuid;
  i int;
begin
  select id into v_default_product
  from public.products
  where is_active = true
  order by name
  limit 1;

  if v_default_product is null then
    raise exception 'suppliers.product_id backfill failed: no active products';
  end if;

  for r in
    select s.id, s.name, s.notes, s.is_active, s.account_type_id, s.created_at, s.updated_at
    from public.suppliers s
  loop
    select array_agg(product_id order by product_id)
    into v_products
    from (
      select distinct product_id
      from (
        select product_id from public.purchases where supplier_id = r.id
        union
        select product_id from public.cash_transfers where supplier_id = r.id
        union
        select product_id from public.warehouse_deliveries where supplier_id = r.id
      ) x
      where product_id is not null
    ) d;

    if v_products is null or cardinality(v_products) = 0 then
      update public.suppliers
      set product_id = v_default_product
      where id = r.id;
      continue;
    end if;

    update public.suppliers
    set product_id = v_products[1]
    where id = r.id;

    if cardinality(v_products) < 2 then
      continue;
    end if;

    for i in 2 .. cardinality(v_products)
    loop
      v_pid := v_products[i];

      insert into public.suppliers (
        name, notes, is_active, account_type_id, product_id, created_at, updated_at
      )
      values (
        r.name, r.notes, r.is_active, r.account_type_id, v_pid, r.created_at, r.updated_at
      )
      returning id into v_new_id;

      update public.purchases
      set supplier_id = v_new_id
      where supplier_id = r.id and product_id = v_pid;

      update public.cash_transfers
      set supplier_id = v_new_id
      where supplier_id = r.id and product_id = v_pid;

      update public.warehouse_deliveries
      set supplier_id = v_new_id
      where supplier_id = r.id and product_id = v_pid;
    end loop;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from public.suppliers where product_id is null) then
    raise exception 'suppliers.product_id backfill left null rows';
  end if;
end $$;

alter table public.suppliers
  alter column product_id set not null;

create index if not exists suppliers_product_idx
  on public.suppliers (product_id);

create unique index if not exists suppliers_active_name_type_product_unique
  on public.suppliers (lower(trim(name)), account_type_id, product_id)
  where is_active = true;

-- 3) supplier_balances — one row per profile (supplier.product_id)
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
  calc as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      s.product_id,
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
    left join money_purchase mp
      on mp.supplier_id = s.id and mp.product_id = s.product_id
    left join transfer_agg ta
      on ta.supplier_id = s.id and ta.product_id = s.product_id
    left join product_delivery pd
      on pd.supplier_id = s.id and pd.product_id = s.product_id
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
  join public.products prod on prod.id = c.product_id
  order by c.supplier_name, at.name, prod.name;
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

-- 4) supplier_detail_bundle — require product scope
drop function if exists public.supplier_detail_bundle(uuid, uuid);

create or replace function public.supplier_detail_bundle(
  p_supplier_id uuid,
  p_product_id uuid,
  p_season_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_season_id uuid;
  v_product_id uuid;
  v_result jsonb;
begin
  if p_supplier_id is null then
    return jsonb_build_object('error', 'supplier_id required');
  end if;

  select s.product_id
  into v_product_id
  from public.suppliers s
  where s.id = p_supplier_id;

  if v_product_id is null then
    return jsonb_build_object('error', 'supplier not found');
  end if;

  if p_product_id is not null and p_product_id is distinct from v_product_id then
    return jsonb_build_object(
      'error', 'product_mismatch',
      'supplier_product_id', v_product_id
    );
  end if;

  select s.id
  into v_season_id
  from public.seasons s
  where s.id = coalesce(
    p_season_id,
    (select a.id from public.seasons a where a.is_active = true limit 1)
  );

  if v_season_id is null then
    return jsonb_build_object(
      'supplier', (
        select to_jsonb(x)
        from (
          select
            s.id,
            s.name,
            s.notes,
            s.is_active,
            s.account_type_id,
            s.product_id,
            coalesce(at.name, '—') as account_type_name,
            coalesce(pr.name, '—') as product_name
          from public.suppliers s
          left join public.account_types at on at.id = s.account_type_id
          left join public.products pr on pr.id = s.product_id
          where s.id = p_supplier_id
        ) x
      ),
      'season', null,
      'due_by_product', '[]'::jsonb,
      'purchases', '[]'::jsonb,
      'transfers', '[]'::jsonb,
      'deliveries', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'product_stats', '[]'::jsonb,
      'lookups', jsonb_build_object(
        'products', coalesce((
          select jsonb_agg(to_jsonb(p) order by p.name)
          from (select id, name from public.products where is_active = true) p
        ), '[]'::jsonb),
        'warehouses', coalesce((
          select jsonb_agg(to_jsonb(w) order by w.name)
          from (select id, name, account_type_id from public.warehouses where is_active = true) w
        ), '[]'::jsonb),
        'sections', coalesce((
          select jsonb_agg(to_jsonb(s) order by s.name)
          from (select id, name, warehouse_id from public.warehouse_sections where is_active = true) s
        ), '[]'::jsonb),
        'stores', coalesce((
          select jsonb_agg(to_jsonb(s) order by s.name)
          from (select id, name from public.stores where is_active = true) s
        ), '[]'::jsonb),
        'stock_statuses', coalesce((
          select jsonb_agg(to_jsonb(s) order by s.name)
          from (select id, name, product_id from public.stock_statuses where is_active = true) s
        ), '[]'::jsonb)
      )
    );
  end if;

  with
  supplier_row as (
    select
      s.id,
      s.name,
      s.notes,
      s.is_active,
      s.account_type_id,
      s.product_id,
      coalesce(at.name, '—') as account_type_name,
      coalesce(pr.name, '—') as product_name
    from public.suppliers s
    left join public.account_types at on at.id = s.account_type_id
    left join public.products pr on pr.id = s.product_id
    where s.id = p_supplier_id
  ),
  season_row as (
    select id, name, ardab_factor
    from public.seasons
    where id = v_season_id
  ),
  due_rows as (
    select *
    from public.supplier_due(p_supplier_id, v_season_id)
    where product_id = v_product_id
  ),
  purchase_rows as (
    select
      pl.id,
      pl.season_id,
      pl.supplier_id,
      pl.product_id,
      pl.purchase_date,
      pl.quantity_kg,
      pl.ardab,
      pl.price_per_ardab,
      pl.total_price,
      pl.notes,
      pl.is_cancelled,
      pl.created_at,
      pl.updated_at,
      pl.running_avg_price
    from public.purchase_ledger pl
    where pl.supplier_id = p_supplier_id
      and pl.season_id = v_season_id
      and pl.product_id = v_product_id
  ),
  transfer_rows as (
    select
      t.id,
      t.season_id,
      t.supplier_id,
      t.product_id,
      t.transfer_date,
      t.amount,
      t.kind,
      t.notes,
      t.is_cancelled,
      t.created_at,
      t.updated_at
    from public.cash_transfers t
    where t.supplier_id = p_supplier_id
      and t.season_id = v_season_id
      and t.product_id = v_product_id
      and t.is_cancelled = false
  ),
  purchase_kg_by_product as (
    select
      product_id,
      coalesce(sum(quantity_kg), 0)::numeric as purchased_kg,
      coalesce(sum(ardab), 0)::numeric as purchased_ardab,
      coalesce(sum(total_price), 0)::numeric as purchases_total,
      (array_agg(price_per_ardab order by purchase_date desc, created_at desc))[1]::numeric as last_price
    from public.purchases
    where supplier_id = p_supplier_id
      and season_id = v_season_id
      and product_id = v_product_id
      and is_cancelled = false
    group by product_id
  ),
  delivery_base as (
    select
      d.id,
      d.season_id,
      d.supplier_id,
      d.product_id,
      d.status_id,
      d.destination_kind,
      d.warehouse_id,
      d.section_id,
      d.store_id,
      d.delivery_date,
      d.quantity_kg,
      d.ardab,
      d.nolon_total,
      d.nathriyat_total,
      d.notes,
      d.is_cancelled,
      d.created_at,
      d.updated_at,
      w.name as warehouse_name,
      sec.name as section_name,
      st.name as store_name,
      pr.name as product_name,
      ss.name as status_name,
      coalesce(pay.nolon_paid, 0)::numeric as nolon_paid,
      coalesce(pay.nathriyat_paid, 0)::numeric as nathriyat_paid,
      coalesce(
        sum(d.quantity_kg) over (
          partition by d.product_id
          order by d.delivery_date asc, d.created_at asc
          rows between unbounded preceding and current row
        ),
        0
      )::numeric as cum_delivered_kg
    from public.warehouse_deliveries d
    left join public.warehouses w on w.id = d.warehouse_id
    left join public.warehouse_sections sec on sec.id = d.section_id
    left join public.stores st on st.id = d.store_id
    left join public.products pr on pr.id = d.product_id
    left join public.stock_statuses ss on ss.id = d.status_id
    left join lateral (
      select
        coalesce(sum(p.amount) filter (where p.kind::text = 'nolon'), 0) as nolon_paid,
        coalesce(sum(p.amount) filter (where p.kind::text = 'nathriyat'), 0) as nathriyat_paid
      from public.delivery_cost_payments p
      where p.delivery_id = d.id
        and p.is_cancelled = false
    ) pay on true
    where d.supplier_id = p_supplier_id
      and d.season_id = v_season_id
      and d.product_id = v_product_id
      and d.is_cancelled = false
  ),
  delivery_rows as (
    select
      d.*,
      round(
        (coalesce(pk.purchased_kg, 0) - (d.cum_delivered_kg - d.quantity_kg))::numeric,
        4
      ) as kg_before,
      round(
        (coalesce(pk.purchased_kg, 0) - d.cum_delivered_kg)::numeric,
        4
      ) as kg_after
    from delivery_base d
    left join purchase_kg_by_product pk on pk.product_id = d.product_id
  ),
  payment_rows as (
    select
      p.id,
      p.delivery_id,
      p.kind,
      p.amount,
      p.payment_date,
      p.notes,
      p.is_cancelled,
      p.created_at,
      p.updated_at
    from public.delivery_cost_payments p
    join public.warehouse_deliveries d on d.id = p.delivery_id
    where d.supplier_id = p_supplier_id
      and d.season_id = v_season_id
      and d.product_id = v_product_id
      and p.is_cancelled = false
  ),
  delivery_agg as (
    select
      product_id,
      coalesce(sum(quantity_kg), 0)::numeric as delivered_kg,
      coalesce(sum(nolon_total), 0)::numeric as nolon_total,
      coalesce(sum(nathriyat_total), 0)::numeric as nathriyat_total,
      coalesce(sum(nolon_paid), 0)::numeric as nolon_paid,
      coalesce(sum(nathriyat_paid), 0)::numeric as nathriyat_paid,
      max(product_name) as product_name
    from delivery_rows
    group by product_id
  ),
  transfer_agg as (
    select
      product_id,
      coalesce(sum(amount) filter (where kind::text <> 'commission'), 0)::numeric as transfers_total,
      coalesce(sum(amount) filter (where kind::text = 'commission'), 0)::numeric as commission_total
    from transfer_rows
    group by product_id
  ),
  product_stats as (
    select
      v_product_id as product_id,
      coalesce(pr.name, del.product_name, due.product_name, '—') as product_name,
      coalesce(pk.purchased_kg, 0) as purchased_kg,
      coalesce(del.delivered_kg, 0) as delivered_kg,
      round((coalesce(pk.purchased_kg, 0) - coalesce(del.delivered_kg, 0))::numeric, 4) as remaining_kg,
      coalesce(pk.purchased_ardab, 0) as purchased_ardab,
      coalesce(pk.purchases_total, 0) as purchases_total,
      coalesce(del.nolon_total, 0) as nolon_total,
      coalesce(del.nathriyat_total, 0) as nathriyat_total,
      coalesce(del.nolon_paid, 0) as nolon_paid,
      coalesce(del.nathriyat_paid, 0) as nathriyat_paid,
      coalesce(tr.transfers_total, 0) as transfers_total,
      coalesce(tr.commission_total, 0) as commission_total,
      coalesce(due.balance, 0) as supplier_balance,
      coalesce(due.ardab_total, 0) as ardab_total,
      coalesce(due.ardab_delivered, 0) as ardab_delivered,
      coalesce(due.ardab_remaining, 0) as ardab_remaining,
      case
        when coalesce(pk.purchased_ardab, 0) > 0 then
          round(
            (
              (
                coalesce(pk.purchases_total, 0)
                + coalesce(del.nolon_total, 0)
                + coalesce(del.nathriyat_total, 0)
              ) / pk.purchased_ardab
            )::numeric,
            4
          )
        else 0::numeric
      end as avg_price_costed,
      coalesce(pk.last_price, 0) as last_price
    from (select 1) _seed
    left join public.products pr on pr.id = v_product_id
    left join purchase_kg_by_product pk on pk.product_id = v_product_id
    left join delivery_agg del on del.product_id = v_product_id
    left join transfer_agg tr on tr.product_id = v_product_id
    left join due_rows due on due.product_id = v_product_id
  )
  select jsonb_build_object(
    'supplier', (select to_jsonb(s) from supplier_row s),
    'season', (select to_jsonb(s) from season_row s),
    'due_by_product', coalesce((select jsonb_agg(to_jsonb(d)) from due_rows d), '[]'::jsonb),
    'purchases', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.purchase_date, p.created_at)
      from purchase_rows p
    ), '[]'::jsonb),
    'transfers', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.transfer_date, t.created_at)
      from transfer_rows t
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'season_id', d.season_id,
          'supplier_id', d.supplier_id,
          'product_id', d.product_id,
          'status_id', d.status_id,
          'destination_kind', d.destination_kind,
          'warehouse_id', d.warehouse_id,
          'section_id', d.section_id,
          'store_id', d.store_id,
          'delivery_date', d.delivery_date,
          'quantity_kg', d.quantity_kg,
          'ardab', d.ardab,
          'nolon_total', d.nolon_total,
          'nathriyat_total', d.nathriyat_total,
          'nolon_paid', d.nolon_paid,
          'nathriyat_paid', d.nathriyat_paid,
          'notes', d.notes,
          'is_cancelled', d.is_cancelled,
          'created_at', d.created_at,
          'updated_at', d.updated_at,
          'kg_before', d.kg_before,
          'kg_after', d.kg_after,
          'warehouses', case
            when d.warehouse_id is null then null
            else jsonb_build_object('id', d.warehouse_id, 'name', d.warehouse_name)
          end,
          'warehouse_sections', case
            when d.section_id is null then null
            else jsonb_build_object('id', d.section_id, 'name', d.section_name, 'warehouse_id', d.warehouse_id)
          end,
          'stores', case
            when d.store_id is null then null
            else jsonb_build_object('id', d.store_id, 'name', d.store_name)
          end,
          'products', case
            when d.product_id is null then null
            else jsonb_build_object('id', d.product_id, 'name', d.product_name)
          end,
          'stock_statuses', case
            when d.status_id is null then null
            else jsonb_build_object('id', d.status_id, 'name', d.status_name)
          end
        )
        order by d.delivery_date, d.created_at
      )
      from delivery_rows d
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.payment_date desc, p.created_at desc)
      from payment_rows p
    ), '[]'::jsonb),
    'product_stats', coalesce((select jsonb_agg(to_jsonb(ps)) from product_stats ps), '[]'::jsonb),
    'lookups', jsonb_build_object(
      'products', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
        from public.products p
        where p.is_active = true
      ), '[]'::jsonb),
      'warehouses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'account_type_id', w.account_type_id
        ) order by w.name)
        from public.warehouses w
        where w.is_active = true
      ), '[]'::jsonb),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'warehouse_id', s.warehouse_id
        ) order by s.name)
        from public.warehouse_sections s
        where s.is_active = true
      ), '[]'::jsonb),
      'stores', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
        from public.stores s
        where s.is_active = true
      ), '[]'::jsonb),
      'stock_statuses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'product_id', s.product_id
        ) order by s.name)
        from public.stock_statuses s
        where s.is_active = true
      ), '[]'::jsonb)
    )
  )
  into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.supplier_detail_bundle(uuid, uuid, uuid) to authenticated;
