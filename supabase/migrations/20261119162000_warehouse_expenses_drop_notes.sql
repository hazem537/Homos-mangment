-- Remove notes from warehouse operating expenses
alter table public.warehouse_expenses
  drop column if exists notes;
