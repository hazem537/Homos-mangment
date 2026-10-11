-- Add sale (بيع) as a stock movement destination (like waste)

alter type public.stock_location_kind add value if not exists 'sale';

alter table public.stock_movements
  drop constraint if exists stock_movements_to_kind_check;

-- Compare as text so the new enum value can be referenced in the same migration transaction
alter table public.stock_movements
  add constraint stock_movements_to_kind_check check (
    to_kind::text in ('section', 'store', 'mekla', 'client', 'waste', 'sale')
  );
