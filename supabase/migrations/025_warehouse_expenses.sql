-- Warehouse operating expenses (workers, electricity, water, etc.)

create table public.warehouse_expenses (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  season_id uuid not null references public.seasons (id),
  payment_date date not null default (current_date),
  amount numeric(14, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_expenses_amount_positive check (amount > 0)
);

create index warehouse_expenses_warehouse_idx on public.warehouse_expenses (warehouse_id);
create index warehouse_expenses_season_idx on public.warehouse_expenses (season_id);
create index warehouse_expenses_date_idx on public.warehouse_expenses (payment_date asc);

create trigger warehouse_expenses_updated_at before update on public.warehouse_expenses
  for each row execute function public.set_updated_at();

alter table public.warehouse_expenses enable row level security;

create policy "Authenticated can read warehouse_expenses"
  on public.warehouse_expenses for select to authenticated using (true);
create policy "Authenticated can insert warehouse_expenses"
  on public.warehouse_expenses for insert to authenticated with check (true);
create policy "Authenticated can update warehouse_expenses"
  on public.warehouse_expenses for update to authenticated using (true);
create policy "Authenticated can delete warehouse_expenses"
  on public.warehouse_expenses for delete to authenticated using (true);
