-- Store slots (خانات المخزن) — part 1: enum, table, default slot, delivery FK.
-- Enum value store_slot is committed here; movement rewrite + RPCs follow in next migration.

do $$ begin
  alter type public.stock_location_kind add value if not exists 'store_slot';
exception
  when duplicate_object then null;
end $$;

create table if not exists public.store_slots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_slots_name_not_blank check (length(trim(name)) > 0),
  constraint store_slots_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists store_slots_store_name_unique
  on public.store_slots (store_id, lower(trim(name)));

create index if not exists store_slots_store_idx
  on public.store_slots (store_id);

drop trigger if exists store_slots_updated_at on public.store_slots;
create trigger store_slots_updated_at
  before update on public.store_slots
  for each row execute function public.set_updated_at();

alter table public.store_slots enable row level security;

drop policy if exists "Authenticated can read store_slots" on public.store_slots;
create policy "Authenticated can read store_slots"
  on public.store_slots for select to authenticated using (true);
drop policy if exists "Authenticated can insert store_slots" on public.store_slots;
create policy "Authenticated can insert store_slots"
  on public.store_slots for insert to authenticated with check (true);
drop policy if exists "Authenticated can update store_slots" on public.store_slots;
create policy "Authenticated can update store_slots"
  on public.store_slots for update to authenticated using (true);
drop policy if exists "Authenticated can delete store_slots" on public.store_slots;
create policy "Authenticated can delete store_slots"
  on public.store_slots for delete to authenticated using (true);

comment on column public.store_slots.color is
  'Optional hex profile color (#RRGGBB) for store slot UI.';

create or replace function public.create_default_store_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.store_slots s
    where s.store_id = new.id
      and s.is_active = true
      and lower(trim(s.name)) = 'رئيسي'
  ) then
    insert into public.store_slots (store_id, name, color)
    values (new.id, 'رئيسي', '#64748B');
  end if;
  return new;
end;
$$;

drop trigger if exists stores_default_slot on public.stores;
create trigger stores_default_slot
  after insert on public.stores
  for each row execute function public.create_default_store_slot();

insert into public.store_slots (store_id, name, color)
select st.id, 'رئيسي', '#64748B'
from public.stores st
where not exists (
  select 1
  from public.store_slots s
  where s.store_id = st.id
    and s.is_active = true
    and lower(trim(s.name)) = 'رئيسي'
);

alter table public.warehouse_deliveries
  add column if not exists store_slot_id uuid references public.store_slots (id) on delete restrict;

update public.warehouse_deliveries d
set store_slot_id = s.id
from public.store_slots s
where d.destination_kind = 'store'
  and d.store_id is not null
  and d.store_slot_id is null
  and s.store_id = d.store_id
  and s.is_active = true
  and lower(trim(s.name)) = 'رئيسي';

update public.warehouse_deliveries d
set store_slot_id = (
  select s.id
  from public.store_slots s
  where s.store_id = d.store_id
    and s.is_active = true
  order by s.created_at
  limit 1
)
where d.destination_kind = 'store'
  and d.store_id is not null
  and d.store_slot_id is null;

create index if not exists warehouse_deliveries_store_slot_idx
  on public.warehouse_deliveries (store_slot_id)
  where store_slot_id is not null;

alter table public.warehouse_deliveries
  drop constraint if exists warehouse_deliveries_destination_check;

alter table public.warehouse_deliveries
  add constraint warehouse_deliveries_destination_check check (
    (
      destination_kind = 'warehouse'
      and warehouse_id is not null
      and section_id is not null
      and store_id is null
      and store_slot_id is null
    )
    or (
      destination_kind = 'store'
      and store_id is not null
      and store_slot_id is not null
      and warehouse_id is null
      and section_id is null
    )
    or (
      -- allow legacy rows mid-migration before slot backfill finishes
      destination_kind = 'store'
      and store_id is not null
      and store_slot_id is null
      and warehouse_id is null
      and section_id is null
    )
  );
