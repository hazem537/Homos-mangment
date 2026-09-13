-- Purchases (E03): raw chickpea buy records linked to season + supplier

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  supplier_id uuid not null references public.suppliers (id),
  purchase_date date not null default (current_date),
  quantity_kg numeric(14, 3) not null,
  ardab numeric(14, 4) not null,
  price_per_ardab numeric(14, 4) not null,
  total_price numeric(14, 2) not null,
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_quantity_positive check (quantity_kg > 0),
  constraint purchases_ardab_positive check (ardab > 0),
  constraint purchases_price_non_negative check (price_per_ardab >= 0),
  constraint purchases_total_non_negative check (total_price >= 0)
);

create index purchases_season_idx on public.purchases (season_id);
create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchases_date_idx on public.purchases (purchase_date desc);

create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;

create policy "Authenticated can read purchases"
  on public.purchases for select to authenticated using (true);
create policy "Authenticated can insert purchases"
  on public.purchases for insert to authenticated with check (true);
create policy "Authenticated can update purchases"
  on public.purchases for update to authenticated using (true);
create policy "Authenticated can delete purchases"
  on public.purchases for delete to authenticated using (true);
