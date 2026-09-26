-- Hard delete: cascade FKs, purge soft-deleted/cancelled rows, unique names

-- 1) Cascade when masters are hard-deleted
alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_warehouse_id_fkey;
alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_warehouse_id_fkey
  foreign key (warehouse_id) references public.warehouses (id) on delete cascade;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_supplier_id_fkey;
alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete cascade;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_section_id_fkey;
alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_section_id_fkey
  foreign key (section_id) references public.warehouse_sections (id);

alter table public.purchases
  drop constraint if exists purchases_supplier_id_fkey;
alter table public.purchases
  add constraint purchases_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete cascade;

alter table public.cash_transfers
  drop constraint if exists cash_transfers_supplier_id_fkey;
alter table public.cash_transfers
  add constraint cash_transfers_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete cascade;

-- 2) Remove cancelled rows
delete from public.delivery_cost_payments where is_cancelled = true;
delete from public.stock_movements where is_cancelled = true;
delete from public.warehouse_deliveries where is_cancelled = true;
delete from public.cash_transfers where is_cancelled = true;
delete from public.purchases where is_cancelled = true;

-- 3) Stock movements on inactive locations
delete from public.stock_movements m
using public.warehouse_sections s
where ((m.from_kind = 'section' and m.from_id = s.id)
    or (m.to_kind = 'section' and m.to_id = s.id))
  and s.is_active = false;

delete from public.stock_movements m
using public.stores st
where ((m.from_kind = 'store' and m.from_id = st.id)
    or (m.to_kind = 'store' and m.to_id = st.id))
  and st.is_active = false;

delete from public.stock_movements m
using public.meklas mk
where ((m.from_kind = 'mekla' and m.from_id = mk.id)
    or (m.to_kind = 'mekla' and m.to_id = mk.id))
  and mk.is_active = false;

delete from public.stock_movements m
using public.clients c
where m.to_kind = 'client' and m.to_id = c.id and c.is_active = false;

-- Deliveries on inactive sections (section FK is restrict)
delete from public.warehouse_deliveries d
using public.warehouse_sections s
where d.section_id = s.id and s.is_active = false;

-- 4) Hard-delete soft-deleted masters (cascade cleans children)
delete from public.warehouse_sections where is_active = false;
delete from public.warehouses where is_active = false;
delete from public.suppliers where is_active = false;
delete from public.stores where is_active = false;
delete from public.meklas where is_active = false;
delete from public.clients where is_active = false;

-- 5) Unique names (no soft-deleted peers)
drop index if exists public.warehouses_active_name_unique;
drop index if exists public.warehouses_name_unique;
create unique index warehouses_name_unique
  on public.warehouses (lower(trim(name)));

drop index if exists public.suppliers_active_name_unique;
drop index if exists public.suppliers_name_unique;
create unique index suppliers_name_unique
  on public.suppliers (lower(trim(name)));

drop index if exists public.stores_active_name_unique;
create unique index stores_name_unique
  on public.stores (lower(trim(name)));

drop index if exists public.meklas_active_name_unique;
create unique index meklas_name_unique
  on public.meklas (lower(trim(name)));

drop index if exists public.clients_active_name_unique;
create unique index clients_name_unique
  on public.clients (lower(trim(name)));

drop index if exists public.warehouse_sections_active_name_unique;
create unique index warehouse_sections_name_unique
  on public.warehouse_sections (warehouse_id, lower(trim(name)));
