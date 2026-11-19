-- Replace suppliers.notes with suppliers.color (profile color).

alter table public.suppliers
  add column if not exists color text;

alter table public.suppliers
  drop constraint if exists suppliers_color_hex;

alter table public.suppliers
  add constraint suppliers_color_hex
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.suppliers.color is
  'Optional hex profile color (#RRGGBB) for supplier UI.';

-- Return type changes (notes -> color): drop then recreate
drop function if exists public.supplier_balances(uuid);

create function public.supplier_balances(p_season_id uuid default null)
returns table (
  supplier_id uuid,
  supplier_name text,
  product_id uuid,
  product_name text,
  color text,
  is_active boolean,
  account_type_id uuid,
  account_type_name text,
  purchases_total numeric,
  transfers_total numeric,
  commission_total numeric,
  balance numeric,
  ardab_factor numeric,
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
    select s.id
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
      s.color,
      s.is_active,
      s.account_type_id,
      coalesce(nullif(s.ardab_factor, 0), 170)::numeric as factor,
      coalesce(mp.purchases_total, 0)::numeric(14, 2) as purchases_total,
      coalesce(ta.transfers_total, 0)::numeric(14, 2) as transfers_total,
      coalesce(ta.commission_total, 0)::numeric(14, 2) as commission_total,
      (
        coalesce(mp.purchases_total, 0)
        - coalesce(ta.transfers_total, 0)
        + coalesce(scp.supplier_paid_total, 0)
      )::numeric(14, 2) as balance,
      coalesce(mp.kg_total, 0)::numeric(14, 3) as kg_total,
      coalesce(pd.kg_delivered, 0)::numeric(14, 3) as kg_delivered
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
    c.color,
    c.is_active,
    c.account_type_id,
    at.name as account_type_name,
    c.purchases_total,
    c.transfers_total,
    c.commission_total,
    c.balance,
    c.factor as ardab_factor,
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

-- supplier_detail_bundle: expose color instead of notes on supplier payload
do $fix$
declare
  def text;
  before_count int;
  after_count int;
begin
  def := pg_get_functiondef('public.supplier_detail_bundle(uuid,uuid,uuid)'::regprocedure);
  before_count := (length(def) - length(replace(def, 's.notes,', ''))) / length('s.notes,');

  def := replace(
    def,
    E'            s.name,\n            s.notes,\n            s.is_active,',
    E'            s.name,\n            s.color,\n            s.is_active,'
  );
  def := replace(
    def,
    E'      s.name,\n      s.notes,\n      s.is_active,',
    E'      s.name,\n      s.color,\n      s.is_active,'
  );
  def := replace(def, 's.notes,', 's.color,');

  after_count := (length(def) - length(replace(def, 's.notes,', ''))) / length('s.notes,');
  if position('s.color,' in def) = 0 then
    raise exception 'supplier_detail_bundle patch failed: s.color missing (had % s.notes before)', before_count;
  end if;
  if after_count > 0 then
    raise exception 'supplier_detail_bundle patch failed: % s.notes remain', after_count;
  end if;

  execute def;
end
$fix$;

alter table public.suppliers
  drop column if exists notes;

grant execute on function public.supplier_balances(uuid) to authenticated;
