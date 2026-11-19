-- Guard destination balances when a movement is deleted, cancelled, or its
-- credit to the destination is reduced / redirected.

create or replace function public.check_stock_movement_destination_remaining()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_remaining numeric(14, 3);
  v_status uuid;
begin
  if tg_op = 'DELETE' then
    if old.is_cancelled then
      return old;
    end if;

    v_status := coalesce(old.to_status_id, old.status_id);
    -- AFTER DELETE: remaining already excludes this row's credit.
    v_remaining := public.location_remaining_kg(
      old.to_kind,
      old.to_id,
      old.product_id,
      v_status,
      old.season_id
    );

    if v_remaining < -0.001 then
      raise exception 'لا يمكن الحذف: رصيد الوجهة سيصبح سالباً (% كجم)', v_remaining;
    end if;

    return old;
  end if;

  -- UPDATE
  if old.is_cancelled then
    return new;
  end if;

  -- Newly cancelled → same as removing the destination credit.
  if new.is_cancelled then
    v_status := coalesce(old.to_status_id, old.status_id);
    v_remaining := public.location_remaining_kg(
      old.to_kind,
      old.to_id,
      old.product_id,
      v_status,
      old.season_id
    );
    if v_remaining < -0.001 then
      raise exception 'لا يمكن الإلغاء: رصيد الوجهة سيصبح سالباً (% كجم)', v_remaining;
    end if;
    return new;
  end if;

  -- AFTER UPDATE: remaining already reflects the new row. Check the old
  -- destination slice (covers qty reduction, dest/status/product change).
  v_status := coalesce(old.to_status_id, old.status_id);
  v_remaining := public.location_remaining_kg(
    old.to_kind,
    old.to_id,
    old.product_id,
    v_status,
    old.season_id
  );

  if v_remaining < -0.001 then
    raise exception 'لا يمكن التعديل: رصيد الوجهة سيصبح سالباً (% كجم)', v_remaining;
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movements_destination_remaining_check on public.stock_movements;
create trigger stock_movements_destination_remaining_check
  after delete or update of
    quantity_kg,
    to_kind,
    to_id,
    product_id,
    status_id,
    to_status_id,
    season_id,
    is_cancelled
  on public.stock_movements
  for each row
  execute function public.check_stock_movement_destination_remaining();
