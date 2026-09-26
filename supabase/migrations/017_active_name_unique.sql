-- Unique warehouse/supplier names only among active rows (soft-deleted may reuse names)

drop index if exists public.warehouses_name_unique;
create unique index warehouses_active_name_unique
  on public.warehouses (lower(trim(name)))
  where is_active = true;

drop index if exists public.suppliers_name_unique;
create unique index suppliers_active_name_unique
  on public.suppliers (lower(trim(name)))
  where is_active = true;
