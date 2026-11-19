-- Remove رقم العربية (vehicle_number) and ملاحظات (notes) from warehouse_deliveries.
-- Bundle RPCs must not select these columns (patched on remote before this drop).

alter table public.warehouse_deliveries
  drop column if exists vehicle_number,
  drop column if exists notes;
