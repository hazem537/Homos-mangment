-- Remove company/investment from warehouses.
-- Suppliers stay free-text (name/notes) — no account_type enum.

alter table public.warehouses
  drop column if exists ownership;

drop type if exists public.place_ownership;
