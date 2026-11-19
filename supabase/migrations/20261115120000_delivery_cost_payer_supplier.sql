-- Company vs supplier share of delivery costs (نولون / نثريات).
-- Supplier-paid amounts increase formal supplier balance.

do $$ begin
  create type public.delivery_cost_payer as enum ('company', 'supplier');
exception
  when duplicate_object then null;
end $$;

alter table public.delivery_cost_payments
  add column if not exists payer public.delivery_cost_payer not null default 'company';

-- Formal balance: purchases − transfers + supplier-paid delivery costs
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
  supplier_cost_paid as (
    select
      d.supplier_id,
      d.product_id,
      coalesce(sum(p.amount), 0)::numeric(14, 2) as supplier_paid_total
    from public.delivery_cost_payments p
    join public.warehouse_deliveries d on d.id = p.delivery_id
    where d.season_id = (select id from season)
      and d.is_cancelled = false
      and p.is_cancelled = false
      and p.payer::text = 'supplier'
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
      (
        coalesce(mp.purchases_total, 0)
        - coalesce(ta.transfers_total, 0)
        + coalesce(scp.supplier_paid_total, 0)
      )::numeric(14, 2) as balance,
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
    left join supplier_cost_paid scp
      on scp.supplier_id = s.id and scp.product_id = s.product_id
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

-- Patch supplier_detail_bundle payment splits (company vs supplier)
do $fix$
declare
  def text;
begin
  def := pg_get_functiondef('public.supplier_detail_bundle(uuid,uuid,uuid)'::regprocedure);

  def := replace(
    def,
    $old$
      coalesce(pay.nolon_paid, 0)::numeric as nolon_paid,
      coalesce(pay.nathriyat_paid, 0)::numeric as nathriyat_paid,
$old$,
    $new$
      coalesce(pay.nolon_paid, 0)::numeric as nolon_paid,
      coalesce(pay.nolon_supplier_paid, 0)::numeric as nolon_supplier_paid,
      coalesce(pay.nathriyat_paid, 0)::numeric as nathriyat_paid,
      coalesce(pay.nathriyat_supplier_paid, 0)::numeric as nathriyat_supplier_paid,
$new$
  );

  def := replace(
    def,
    $old$
      select
        coalesce(sum(p.amount) filter (where p.kind::text = 'nolon'), 0) as nolon_paid,
        coalesce(sum(p.amount) filter (where p.kind::text = 'nathriyat'), 0) as nathriyat_paid
      from public.delivery_cost_payments p
      where p.delivery_id = d.id
        and p.is_cancelled = false
$old$,
    $new$
      select
        coalesce(sum(p.amount) filter (
          where p.kind::text = 'nolon' and p.payer::text = 'company'
        ), 0) as nolon_paid,
        coalesce(sum(p.amount) filter (
          where p.kind::text = 'nolon' and p.payer::text = 'supplier'
        ), 0) as nolon_supplier_paid,
        coalesce(sum(p.amount) filter (
          where p.kind::text = 'nathriyat' and p.payer::text = 'company'
        ), 0) as nathriyat_paid,
        coalesce(sum(p.amount) filter (
          where p.kind::text = 'nathriyat' and p.payer::text = 'supplier'
        ), 0) as nathriyat_supplier_paid
      from public.delivery_cost_payments p
      where p.delivery_id = d.id
        and p.is_cancelled = false
$new$
  );

  def := replace(
    def,
    $old$
      coalesce(sum(nolon_paid), 0)::numeric as nolon_paid,
      coalesce(sum(nathriyat_paid), 0)::numeric as nathriyat_paid,
$old$,
    $new$
      coalesce(sum(nolon_paid), 0)::numeric as nolon_paid,
      coalesce(sum(nolon_supplier_paid), 0)::numeric as nolon_supplier_paid,
      coalesce(sum(nathriyat_paid), 0)::numeric as nathriyat_paid,
      coalesce(sum(nathriyat_supplier_paid), 0)::numeric as nathriyat_supplier_paid,
$new$
  );

  def := replace(
    def,
    $old$
      coalesce(del.nolon_paid, 0) as nolon_paid,
      coalesce(del.nathriyat_paid, 0) as nathriyat_paid,
$old$,
    $new$
      coalesce(del.nolon_paid, 0) as nolon_paid,
      coalesce(del.nolon_supplier_paid, 0) as nolon_supplier_paid,
      coalesce(del.nathriyat_paid, 0) as nathriyat_paid,
      coalesce(del.nathriyat_supplier_paid, 0) as nathriyat_supplier_paid,
$new$
  );

  def := replace(
    def,
    $old$
          'nolon_paid', d.nolon_paid,
          'nathriyat_paid', d.nathriyat_paid,
$old$,
    $new$
          'nolon_paid', d.nolon_paid,
          'nolon_supplier_paid', d.nolon_supplier_paid,
          'nathriyat_paid', d.nathriyat_paid,
          'nathriyat_supplier_paid', d.nathriyat_supplier_paid,
$new$
  );

  -- Include payer on payment rows payload when selecting payment_rows
  def := replace(
    def,
    $old$
      p.kind,
      p.amount,
      p.payment_date,
      p.notes,
$old$,
    $new$
      p.kind,
      p.amount,
      p.payer,
      p.payment_date,
      p.notes,
$new$
  );

  if position('nolon_supplier_paid' in def) = 0 then
    raise exception 'supplier_detail_bundle patch failed: nolon_supplier_paid missing';
  end if;

  execute def;
end
$fix$;

-- supplier_stats_bundle: company/supplier split + money_due includes supplier-paid costs
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
      coalesce(sum(pay.amount) filter (
        where pay.kind::text = 'nolon' and pay.payer::text = 'company'
      ), 0)::numeric as nolon_paid,
      coalesce(sum(pay.amount) filter (
        where pay.kind::text = 'nolon' and pay.payer::text = 'supplier'
      ), 0)::numeric as nolon_supplier_paid,
      coalesce(sum(pay.amount) filter (
        where pay.kind::text = 'nathriyat' and pay.payer::text = 'company'
      ), 0)::numeric as nathriyat_paid,
      coalesce(sum(pay.amount) filter (
        where pay.kind::text = 'nathriyat' and pay.payer::text = 'supplier'
      ), 0)::numeric as nathriyat_supplier_paid,
      coalesce(sum(pay.amount) filter (where pay.payer::text = 'company'), 0)::numeric as cost_paid,
      coalesce(sum(pay.amount) filter (where pay.payer::text = 'supplier'), 0)::numeric as cost_supplier_paid
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
      round((
        coalesce(pa.purchases_total, 0)
        - coalesce(ta.money_paid, 0)
        + coalesce(cpa.cost_supplier_paid, 0)
      )::numeric, 2) as money_due,
      coalesce(ta.commission_total, 0) as commission_total,
      coalesce(da.nolon_total, 0) as nolon_total,
      coalesce(da.nathriyat_total, 0) as nathriyat_total,
      round((coalesce(da.nolon_total, 0) + coalesce(da.nathriyat_total, 0))::numeric, 2) as cost_total,
      coalesce(cpa.nolon_paid, 0) as nolon_paid,
      coalesce(cpa.nolon_supplier_paid, 0) as nolon_supplier_paid,
      coalesce(cpa.nathriyat_paid, 0) as nathriyat_paid,
      coalesce(cpa.nathriyat_supplier_paid, 0) as nathriyat_supplier_paid,
      coalesce(cpa.cost_paid, 0) as cost_paid,
      coalesce(cpa.cost_supplier_paid, 0) as cost_supplier_paid,
      round((
        coalesce(da.nolon_total, 0)
        - coalesce(cpa.nolon_paid, 0)
        - coalesce(cpa.nolon_supplier_paid, 0)
      )::numeric, 2) as nolon_remaining,
      round((
        coalesce(da.nolon_total, 0) + coalesce(da.nathriyat_total, 0)
        - coalesce(cpa.cost_paid, 0) - coalesce(cpa.cost_supplier_paid, 0)
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
      coalesce(sum(sr.nolon_supplier_paid), 0) as nolon_supplier_paid,
      coalesce(sum(sr.nathriyat_paid), 0) as nathriyat_paid,
      coalesce(sum(sr.nathriyat_supplier_paid), 0) as nathriyat_supplier_paid,
      coalesce(sum(sr.cost_paid), 0) as cost_paid,
      coalesce(sum(sr.cost_supplier_paid), 0) as cost_supplier_paid,
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

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.supplier_balances(uuid) to authenticated;
grant execute on function public.supplier_stats_bundle(uuid, uuid, uuid) to authenticated;
