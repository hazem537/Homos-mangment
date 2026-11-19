-- Restore per-warehouse operating costs; fold into type-level avg_price_per_ardab.
-- Drop central season_costs after best-effort migrate.

create table public.warehouse_expenses (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  season_id uuid not null references public.seasons (id),
  payment_date date not null default (current_date),
  title text not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_expenses_title_nonempty check (length(trim(title)) > 0),
  constraint warehouse_expenses_amount_positive check (amount > 0)
);

create index warehouse_expenses_warehouse_idx on public.warehouse_expenses (warehouse_id);
create index warehouse_expenses_season_idx on public.warehouse_expenses (season_id);
create index warehouse_expenses_date_idx on public.warehouse_expenses (payment_date asc, created_at asc);

create trigger warehouse_expenses_updated_at before update on public.warehouse_expenses
  for each row execute function public.set_updated_at();

alter table public.warehouse_expenses enable row level security;

create policy "Authenticated can read warehouse_expenses"
  on public.warehouse_expenses for select to authenticated using (true);
create policy "Authenticated can insert warehouse_expenses"
  on public.warehouse_expenses for insert to authenticated with check (true);
create policy "Authenticated can update warehouse_expenses"
  on public.warehouse_expenses for update to authenticated using (true);
create policy "Authenticated can delete warehouse_expenses"
  on public.warehouse_expenses for delete to authenticated using (true);

-- Best-effort: season_costs notes from original migrate were 'من شونة: {warehouse.name}'
insert into public.warehouse_expenses (
  id, warehouse_id, season_id, payment_date, title, amount, created_at, updated_at
)
select
  sc.id,
  w.id,
  sc.season_id,
  sc.cost_date,
  sc.title,
  sc.amount,
  sc.created_at,
  sc.updated_at
from public.season_costs sc
join public.warehouses w
  on trim(sc.notes) = ('من شونة: ' || w.name)
   or trim(sc.notes) = ('من شونة:' || w.name);

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
      'movements_in', '[]'::jsonb,
      'expenses', '[]'::jsonb
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
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.payment_date, e.created_at)
      from public.warehouse_expenses e
      where e.warehouse_id = p_warehouse_id
        and e.season_id = v_season_id
    ), '[]'::jsonb)
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object('error', 'warehouse not found'));
end;
$$;

grant execute on function public.warehouse_detail_bundle(uuid, uuid) to authenticated;

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
  v_result jsonb;
begin
  if p_product_id is null then
    return jsonb_build_object('error', 'product_id required', 'by_type', '[]'::jsonb, 'by_supplier', '[]'::jsonb);
  end if;

  select s.id
  into v_season_id
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
      coalesce(nullif(s.ardab_factor, 0), 170)::numeric as ardab_factor,
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
  warehouse_cost_agg as (
    select
      w.account_type_id,
      coalesce(sum(e.amount), 0)::numeric as warehouse_costs_total
    from public.warehouse_expenses e
    join public.warehouses w on w.id = e.warehouse_id
    where e.season_id = v_season_id
      and (p_account_type_id is null or w.account_type_id = p_account_type_id)
    group by w.account_type_id
  ),
  supplier_rows as (
    select
      s.id as supplier_id,
      s.name as supplier_name,
      s.product_id,
      s.account_type_id,
      s.account_type_name,
      s.ardab_factor,
      coalesce(pa.purchased_kg, 0) as purchased_kg,
      coalesce(da.delivered_kg, 0) as delivered_kg,
      round((coalesce(pa.purchased_kg, 0) - coalesce(da.delivered_kg, 0))::numeric, 4) as remaining_kg,
      round((coalesce(pa.purchased_kg, 0) / nullif(s.ardab_factor, 0))::numeric, 4) as ardab_total,
      round((coalesce(da.delivered_kg, 0) / nullif(s.ardab_factor, 0))::numeric, 4) as ardab_delivered,
      round(((coalesce(pa.purchased_kg, 0) - coalesce(da.delivered_kg, 0)) / nullif(s.ardab_factor, 0))::numeric, 4) as ardab_remaining,
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
        when (coalesce(pa.purchased_kg, 0) / nullif(s.ardab_factor, 0)) > 0.00005 then
          round((
            (
              coalesce(pa.purchases_total, 0)
              + coalesce(ta.commission_total, 0)
              + coalesce(da.nolon_total, 0)
              + coalesce(da.nathriyat_total, 0)
            ) / (coalesce(pa.purchased_kg, 0) / nullif(s.ardab_factor, 0))
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
      coalesce(max(wca.warehouse_costs_total), 0) as warehouse_costs_total,
      case
        when coalesce(sum(sr.ardab_total), 0) > 0.00005 then
          round((
            (
              coalesce(sum(sr.purchases_total), 0)
              + coalesce(sum(sr.commission_total), 0)
              + coalesce(sum(sr.nolon_total), 0)
              + coalesce(sum(sr.nathriyat_total), 0)
              + coalesce(max(wca.warehouse_costs_total), 0)
            ) / sum(sr.ardab_total)
          )::numeric, 2)
        else 0::numeric
      end as avg_price_per_ardab
    from type_seed ts
    left join supplier_rows sr on sr.account_type_id = ts.account_type_id
    left join warehouse_cost_agg wca on wca.account_type_id = ts.account_type_id
    group by ts.account_type_id, ts.account_type_name
  )
  select jsonb_build_object(
    'season', jsonb_build_object('id', v_season_id),
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

grant execute on function public.supplier_stats_bundle(uuid, uuid, uuid) to authenticated;

drop table if exists public.season_costs;
