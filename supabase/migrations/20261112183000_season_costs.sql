-- Season-level operating costs (replaces warehouse_expenses)

create table public.season_costs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  cost_date date not null default (current_date),
  title text not null,
  amount numeric(14, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_costs_title_nonempty check (length(trim(title)) > 0),
  constraint season_costs_amount_positive check (amount > 0)
);

create index season_costs_season_idx on public.season_costs (season_id);
create index season_costs_date_idx on public.season_costs (cost_date asc, created_at asc);

create trigger season_costs_updated_at before update on public.season_costs
  for each row execute function public.set_updated_at();

alter table public.season_costs enable row level security;

create policy "Authenticated can read season_costs"
  on public.season_costs for select to authenticated using (true);
create policy "Authenticated can insert season_costs"
  on public.season_costs for insert to authenticated with check (true);
create policy "Authenticated can update season_costs"
  on public.season_costs for update to authenticated using (true);
create policy "Authenticated can delete season_costs"
  on public.season_costs for delete to authenticated using (true);

insert into public.season_costs (id, season_id, cost_date, title, amount, notes, created_at, updated_at)
select
  e.id,
  e.season_id,
  e.payment_date,
  coalesce(nullif(trim(e.notes), ''), 'مصروف شونة'),
  e.amount,
  'من شونة: ' || coalesce(
    (select w.name from public.warehouses w where w.id = e.warehouse_id),
    e.warehouse_id::text
  ),
  e.created_at,
  e.updated_at
from public.warehouse_expenses e;

-- Remove expenses from warehouse detail payload
create or replace function public.warehouse_detail_bundle(
  p_warehouse_id uuid,
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
      'movements_in', '[]'::jsonb
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
          'notes', s.notes,
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
          'notes', d.notes,
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
          'movement_date', m.movement_date,
          'created_at', m.created_at,
          'quantity_kg', m.quantity_kg,
          'notes', m.notes,
          'from_kind', m.from_kind,
          'to_kind', m.to_kind,
          'to_id', m.to_id,
          'status_name', st.name,
          'destination', public.stock_location_label(m.to_kind, m.to_id, p_warehouse_id)
        )
        order by m.movement_date, m.created_at
      )
      from public.stock_movements m
      join public.warehouse_sections sec on sec.id = m.from_id
      left join public.stock_statuses st on st.id = m.status_id
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
          'status_id', m.status_id,
          'movement_date', m.movement_date,
          'created_at', m.created_at,
          'quantity_kg', m.quantity_kg,
          'notes', m.notes,
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
    ), '[]'::jsonb)
  )
  into v_result;

  return coalesce(v_result, jsonb_build_object('error', 'warehouse not found'));
end;
$$;

grant execute on function public.warehouse_detail_bundle(uuid, uuid) to authenticated;

drop table if exists public.warehouse_expenses;
