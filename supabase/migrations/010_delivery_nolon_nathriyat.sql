-- E08: nolon + nathriyat costs on each warehouse delivery (separate from purchase/transfer money)

alter table public.warehouse_deliveries
  add column if not exists nolon_total numeric(14, 2) not null default 0;

alter table public.warehouse_deliveries
  add column if not exists nolon_paid numeric(14, 2) not null default 0;

alter table public.warehouse_deliveries
  add column if not exists nathriyat_total numeric(14, 2) not null default 0;

alter table public.warehouse_deliveries
  add column if not exists nathriyat_paid numeric(14, 2) not null default 0;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nolon_nonneg;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nolon_paid_nonneg;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nathriyat_nonneg;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_nathriyat_paid_nonneg;

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_nolon_nonneg check (nolon_total >= 0);

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_nolon_paid_nonneg check (nolon_paid >= 0);

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_nathriyat_nonneg check (nathriyat_total >= 0);

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_nathriyat_paid_nonneg check (nathriyat_paid >= 0);
