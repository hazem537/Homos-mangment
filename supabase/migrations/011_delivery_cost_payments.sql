-- E08: payment history for nolon / nathriyat per delivery (partial + multi-day)
-- Safe if 010 paid columns were never added (skips backfill).

do $$ begin
  create type public.delivery_cost_kind as enum ('nolon', 'nathriyat');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.delivery_cost_payments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.warehouse_deliveries (id) on delete cascade,
  kind public.delivery_cost_kind not null,
  amount numeric(14, 2) not null,
  payment_date date not null default (current_date),
  notes text,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_cost_payments_amount_positive check (amount > 0)
);

create index if not exists delivery_cost_payments_delivery_idx
  on public.delivery_cost_payments (delivery_id);

create index if not exists delivery_cost_payments_date_idx
  on public.delivery_cost_payments (payment_date desc);

drop trigger if exists delivery_cost_payments_updated_at on public.delivery_cost_payments;
create trigger delivery_cost_payments_updated_at before update on public.delivery_cost_payments
  for each row execute function public.set_updated_at();

alter table public.delivery_cost_payments enable row level security;

drop policy if exists "Authenticated can read delivery_cost_payments" on public.delivery_cost_payments;
create policy "Authenticated can read delivery_cost_payments"
  on public.delivery_cost_payments for select to authenticated using (true);

drop policy if exists "Authenticated can insert delivery_cost_payments" on public.delivery_cost_payments;
create policy "Authenticated can insert delivery_cost_payments"
  on public.delivery_cost_payments for insert to authenticated with check (true);

drop policy if exists "Authenticated can update delivery_cost_payments" on public.delivery_cost_payments;
create policy "Authenticated can update delivery_cost_payments"
  on public.delivery_cost_payments for update to authenticated using (true);

drop policy if exists "Authenticated can delete delivery_cost_payments" on public.delivery_cost_payments;
create policy "Authenticated can delete delivery_cost_payments"
  on public.delivery_cost_payments for delete to authenticated using (true);

-- Ensure totals exist even if 010 was skipped
alter table public.warehouse_deliveries
  add column if not exists nolon_total numeric(14, 2) not null default 0;

alter table public.warehouse_deliveries
  add column if not exists nathriyat_total numeric(14, 2) not null default 0;

-- Backfill from legacy paid columns only when they exist
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'warehouse_deliveries'
      and column_name = 'nolon_paid'
  ) then
    insert into public.delivery_cost_payments (delivery_id, kind, amount, payment_date, notes)
    select d.id, 'nolon'::public.delivery_cost_kind, d.nolon_paid, d.delivery_date, 'ترحيل من الرصيد المدفوع السابق'
    from public.warehouse_deliveries d
    where coalesce(d.nolon_paid, 0) > 0
      and not exists (
        select 1 from public.delivery_cost_payments p
        where p.delivery_id = d.id and p.kind = 'nolon' and p.is_cancelled = false
      );
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'warehouse_deliveries'
      and column_name = 'nathriyat_paid'
  ) then
    insert into public.delivery_cost_payments (delivery_id, kind, amount, payment_date, notes)
    select d.id, 'nathriyat'::public.delivery_cost_kind, d.nathriyat_paid, d.delivery_date, 'ترحيل من الرصيد المدفوع السابق'
    from public.warehouse_deliveries d
    where coalesce(d.nathriyat_paid, 0) > 0
      and not exists (
        select 1 from public.delivery_cost_payments p
        where p.delivery_id = d.id and p.kind = 'nathriyat' and p.is_cancelled = false
      );
  end if;
end $$;

-- Drop legacy paid columns if present
alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nolon_paid_nonneg;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nathriyat_paid_nonneg;

alter table public.warehouse_deliveries
  drop column if exists nolon_paid;

alter table public.warehouse_deliveries
  drop column if exists nathriyat_paid;
