-- Remove البيان (notes) from cash_transfers; keep only تحويل / عموله in the app UI.
-- Update supplier_detail_bundle transfer_rows so it no longer selects t.notes.

create or replace function public.supplier_detail_bundle(
  p_supplier_id uuid,
  p_product_id uuid,
  p_season_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
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
$function$;

alter table public.cash_transfers drop column if exists notes;
