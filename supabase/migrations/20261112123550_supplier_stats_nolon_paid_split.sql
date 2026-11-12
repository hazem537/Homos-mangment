-- Split delivery cost payments into nolon_paid / nathriyat_paid / nolon_remaining
-- inside supplier_stats_bundle (already applied remotely).

create or replace function public.supplier_stats_bundle(
  p_product_id uuid,
  p_season_id uuid default null,
  p_account_type_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_season_id uuid;
  v_factor numeric;
  v_result jsonb;
begin
  if p_product_id is null then
    return jsonb_build_object('error', 'product_id required', 'by_type', '[]'::jsonb, 'by_supplier', '[]'::jsonb);
  end if;

  select s.id, coalesce(s.ardab_factor, 170)
  into v_season_id, v_factor
  from public.seasons s
  where s.id = coalesce(
    p_season_id,
    (select a.id from public.seasons a where a.is_active = true limit 1)
  );

  if v_season_id is null then
    return jsonb_build_object('by_type', '[]'::jsonb, 'by_supplier', '[]'::jsonb, 'season', null);
  end if;

  with
  suppliers_scoped as (
    select
      s.id,
      s.name,
      s.account_type_id,
      s.product_id,
      at.name as account_type_name
    from public.suppliers s
    join public.account_types at on at.id = s.account_type_id
    where s.is_active = true
      and s.product_id = p_product_id
      and (p_account_type_id is null or s.account_type_id = p_account_type_id)
  ),
  purchase_agg as (
    select
      p.supplier_id,
      coalesce(sum(p.quantity_kg), 0)::numeric as purchased_kg,
      coalesce(sum(p.total_price), 0)::numeric as purchases_total
    from public.purchases p
    join suppliers_scoped s on s.id = p.supplier_id
    where p.season_id = v_season_id
      and p.product_id = p_product_id
      and p.is_cancelled = false
    group by p.supplier_id
  ),
  delivery_agg as (
    select
      d.supplier_id,
      coalesce(sum(d.quantity_kg), 0)::numeric as delivered_kg,
      coalesce(sum(d.nolon_total), 0)::numeric as nolon_total,
      coalesce(sum(d.nathriyat_total), 0)::numeric as nathriyat_total
    from public.warehouse_deliveries d
    join suppliers_scoped s on s.id = d.supplier_id
    where d.season_id = v_season_id
      and d.product_id = p_product_id
      and d.is_cancelled = false
    group by d.supplier_id
  ),
  transfer_agg as (
    select
      t.supplier_id,
      coalesce(sum(t.amount) filter (where t.kind::text <> 'commission'), 0)::numeric as money_paid,
      coalesce(sum(t.amount) filter (where t.kind::text = 'commission'), 0)::numeric as commission_total
    from public.cash_transfers t
    join suppliers_scoped s on s.id = t.supplier_id
    where t.season_id = v_season_id
      and t.product_id = p_product_id
      and t.is_cancelled = false
    group by t.supplier_id
  ),
  cost_paid_agg as (
    select
      d.supplier_id,
      coalesce(sum(pay.amount) filter (where pay.kind::text = 'nolon'), 0)::numeric as nolon_paid,
      coalesce(sum(pay.amount) filter (where pay.kind::text = 'nathriyat'), 0)::numeric as nathriyat_paid,
      coalesce(sum(pay.amount), 0)::numeric as cost_paid
    from public.delivery_cost_payments pay
    join public.warehouse_deliveries d on d.id = pay.delivery_id
    join suppliers_scoped s on s.id = d.supplier_id
    where d.season_id = v_season_id
      and d.product_id = p_product_id
      and d.is_cancelled = false
      and pay.is_cancelled = false
    group by d.supplier_id
  ),
  supplier_rows as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      s.product_id,
      s.account_type_id,
      s.account_type_name,
      coalesce(pa.purchased_kg, 0) as purchased_kg,
      coalesce(da.delivered_kg, 0) as delivered_kg,
      round((coalesce(pa.purchased_kg, 0) - coalesce(da.delivered_kg, 0))::numeric, 4) as remaining_kg,
      round((coalesce(pa.purchased_kg, 0) / nullif(v_factor, 0))::numeric, 4) as ardab_total,
      round((coalesce(da.delivered_kg, 0) / nullif(v_factor, 0))::numeric, 4) as ardab_delivered,
      round(((coalesce(pa.purchased_kg, 0) - coalesce(da.delivered_kg, 0)) / nullif(v_factor, 0))::numeric, 4) as ardab_remaining,
      coalesce(pa.purchases_total, 0) as purchases_total,
      coalesce(ta.money_paid, 0) as money_paid,
      round((coalesce(pa.purchases_total, 0) - coalesce(ta.money_paid, 0))::numeric, 2) as money_due,
      coalesce(ta.commission_total, 0) as commission_total,
      coalesce(da.nolon_total, 0) as nolon_total,
      coalesce(da.nathriyat_total, 0) as nathriyat_total,
      round((coalesce(da.nolon_total, 0) + coalesce(da.nathriyat_total, 0))::numeric, 2) as cost_total,
      coalesce(cpa.nolon_paid, 0) as nolon_paid,
      coalesce(cpa.nathriyat_paid, 0) as nathriyat_paid,
      coalesce(cpa.cost_paid, 0) as cost_paid,
      round((coalesce(da.nolon_total, 0) - coalesce(cpa.nolon_paid, 0))::numeric, 2) as nolon_remaining,
      round((
        coalesce(da.nolon_total, 0) + coalesce(da.nathriyat_total, 0) - coalesce(cpa.cost_paid, 0)
      )::numeric, 2) as cost_needed,
      case
        when (coalesce(pa.purchased_kg, 0) / nullif(v_factor, 0)) > 0.00005 then
          round((
            (
              coalesce(pa.purchases_total, 0)
              + coalesce(ta.commission_total, 0)
              + coalesce(da.nolon_total, 0)
              + coalesce(da.nathriyat_total, 0)
            ) / (coalesce(pa.purchased_kg, 0) / nullif(v_factor, 0))
          )::numeric, 2)
        else 0::numeric
      end as avg_price_per_ardab
    from suppliers_scoped s
    left join purchase_agg pa on pa.supplier_id = s.id
    left join delivery_agg da on da.supplier_id = s.id
    left join transfer_agg ta on ta.supplier_id = s.id
    left join cost_paid_agg cpa on cpa.supplier_id = s.id
  ),
  type_seed as (
    select at.id as account_type_id, at.name as account_type_name
    from public.account_types at
    where p_account_type_id is null or at.id = p_account_type_id
  ),
  type_rows as (
    select
      ts.account_type_id,
      ts.account_type_name,
      coalesce(sum(sr.purchased_kg), 0) as purchased_kg,
      coalesce(sum(sr.delivered_kg), 0) as delivered_kg,
      coalesce(sum(sr.remaining_kg), 0) as remaining_kg,
      coalesce(sum(sr.ardab_total), 0) as ardab_total,
      coalesce(sum(sr.ardab_delivered), 0) as ardab_delivered,
      coalesce(sum(sr.ardab_remaining), 0) as ardab_remaining,
      coalesce(sum(sr.purchases_total), 0) as purchases_total,
      coalesce(sum(sr.money_paid), 0) as money_paid,
      coalesce(sum(sr.money_due), 0) as money_due,
      coalesce(sum(sr.commission_total), 0) as commission_total,
      coalesce(sum(sr.nolon_total), 0) as nolon_total,
      coalesce(sum(sr.nathriyat_total), 0) as nathriyat_total,
      coalesce(sum(sr.cost_total), 0) as cost_total,
      coalesce(sum(sr.nolon_paid), 0) as nolon_paid,
      coalesce(sum(sr.nathriyat_paid), 0) as nathriyat_paid,
      coalesce(sum(sr.cost_paid), 0) as cost_paid,
      coalesce(sum(sr.nolon_remaining), 0) as nolon_remaining,
      coalesce(sum(sr.cost_needed), 0) as cost_needed,
      case
        when coalesce(sum(sr.ardab_total), 0) > 0.00005 then
          round((
            (
              coalesce(sum(sr.purchases_total), 0)
              + coalesce(sum(sr.commission_total), 0)
              + coalesce(sum(sr.nolon_total), 0)
              + coalesce(sum(sr.nathriyat_total), 0)
            ) / sum(sr.ardab_total)
          )::numeric, 2)
        else 0::numeric
      end as avg_price_per_ardab
    from type_seed ts
    left join supplier_rows sr on sr.account_type_id = ts.account_type_id
    group by ts.account_type_id, ts.account_type_name
  )
  select jsonb_build_object(
    'season', jsonb_build_object('id', v_season_id, 'ardab_factor', v_factor),
    'by_type', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.account_type_name)
      from type_rows t
    ), '[]'::jsonb),
    'by_supplier', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.purchased_kg desc, s.supplier_name)
      from supplier_rows s
    ), '[]'::jsonb)
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object('by_type', '[]'::jsonb, 'by_supplier', '[]'::jsonb));
end;
$$;

grant execute on function public.supplier_stats_bundle(uuid, uuid, uuid) to authenticated;
