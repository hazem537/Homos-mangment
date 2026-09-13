-- Cash transfers (E04): payments / settlements linked to season + supplier

create type public.transfer_kind as enum ('transfer', 'settlement', 'other');

create table public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  supplier_id uuid not null references public.suppliers (id),
  transfer_date date not null default (current_date),
  amount numeric(14, 2) not null,
  kind public.transfer_kind not null default 'transfer',
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_transfers_amount_positive check (amount > 0)
);

create index cash_transfers_season_idx on public.cash_transfers (season_id);
create index cash_transfers_supplier_idx on public.cash_transfers (supplier_id);
create index cash_transfers_date_idx on public.cash_transfers (transfer_date desc);

create trigger cash_transfers_updated_at before update on public.cash_transfers
  for each row execute function public.set_updated_at();

alter table public.cash_transfers enable row level security;

create policy "Authenticated can read cash_transfers"
  on public.cash_transfers for select to authenticated using (true);
create policy "Authenticated can insert cash_transfers"
  on public.cash_transfers for insert to authenticated with check (true);
create policy "Authenticated can update cash_transfers"
  on public.cash_transfers for update to authenticated using (true);
create policy "Authenticated can delete cash_transfers"
  on public.cash_transfers for delete to authenticated using (true);
