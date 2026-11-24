-- When supplier.ardab_factor changes, recalculate stored ardab on purchases
-- and warehouse_deliveries (and purchase total_price) from quantity_kg.

create or replace function public.sync_supplier_ardab_on_factor_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_factor numeric(12, 4);
begin
  if tg_op = 'UPDATE'
     and new.ardab_factor is not distinct from old.ardab_factor then
    return new;
  end if;

  v_factor := coalesce(nullif(new.ardab_factor, 0), 170);

  update public.purchases p
  set
    ardab = round((p.quantity_kg / v_factor)::numeric, 4),
    total_price = round(
      (round((p.quantity_kg / v_factor)::numeric, 4) * p.price_per_ardab)::numeric,
      2
    )
  where p.supplier_id = new.id;

  update public.warehouse_deliveries d
  set ardab = round((d.quantity_kg / v_factor)::numeric, 4)
  where d.supplier_id = new.id;

  return new;
end;
$$;

comment on function public.sync_supplier_ardab_on_factor_change() is
  'Keep purchase/delivery ardab (and purchase totals) in sync when supplier ardab_factor changes.';

drop trigger if exists suppliers_sync_ardab_on_factor_change on public.suppliers;

create trigger suppliers_sync_ardab_on_factor_change
  after update of ardab_factor on public.suppliers
  for each row
  execute function public.sync_supplier_ardab_on_factor_change();

-- One-time backfill: align existing rows with each supplier's current factor
update public.purchases p
set
  ardab = round((p.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4),
  total_price = round(
    (
      round((p.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4)
      * p.price_per_ardab
    )::numeric,
    2
  )
from public.suppliers s
where p.supplier_id = s.id
  and (
    p.ardab is distinct from round((p.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4)
    or p.total_price is distinct from round(
      (
        round((p.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4)
        * p.price_per_ardab
      )::numeric,
      2
    )
  );

update public.warehouse_deliveries d
set ardab = round((d.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4)
from public.suppliers s
where d.supplier_id = s.id
  and d.ardab is distinct from round((d.quantity_kg / coalesce(nullif(s.ardab_factor, 0), 170))::numeric, 4);
