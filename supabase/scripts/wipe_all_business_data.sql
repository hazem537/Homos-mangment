-- HARD DELETE all business data (active + soft-deleted).
-- Does NOT delete auth.users / profiles.
-- Run in Supabase SQL Editor. Irreversible.

begin;

-- Child / transaction tables first
truncate table public.warehouse_expenses cascade;
truncate table public.delivery_cost_payments cascade;
truncate table public.stock_movements cascade;
truncate table public.warehouse_deliveries cascade;
truncate table public.cash_transfers cascade;
truncate table public.purchases cascade;

-- Location masters & warehouse structure
truncate table public.warehouse_sections cascade;
truncate table public.warehouses cascade;
truncate table public.suppliers cascade;
truncate table public.stores cascade;
truncate table public.meklas cascade;
truncate table public.clients cascade;
truncate table public.products cascade;
truncate table public.stock_statuses cascade;

-- Seasons last (referenced by transactions above)
truncate table public.seasons cascade;

-- Optional: re-seed one active season + default product
insert into public.seasons (name, year, ardab_factor, is_active)
values ('موسم 2026', 2026, 170, true);

insert into public.products (name, notes)
values ('حمص خام', 'الصنف الافتراضي');

commit;
