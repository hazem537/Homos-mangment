-- Link stock_statuses to products (each product has its own statuses)
-- No staging/temp tables — remaps by (product_id + name) so it works in Supabase SQL Editor.

alter table public.stock_statuses
  add column if not exists product_id uuid references public.products (id) on delete cascade;

-- Must drop global name uniqueness BEFORE cloning the same name per product
drop index if exists public.stock_statuses_name_unique;
alter table public.stock_statuses drop constraint if exists stock_statuses_name_unique;

-- Clone each global status onto every product (skip if already present)
insert into public.stock_statuses (name, notes, is_active, product_id)
select g.name, g.notes, g.is_active, p.id
from public.stock_statuses g
cross join public.products p
where g.product_id is null
  and not exists (
    select 1
    from public.stock_statuses s
    where s.product_id = p.id
      and lower(trim(s.name)) = lower(trim(g.name))
  );

-- Remap deliveries from global status → product-specific status (same name)
update public.warehouse_deliveries d
set status_id = s_new.id
from public.stock_statuses s_old,
     public.stock_statuses s_new
where d.status_id = s_old.id
  and s_old.product_id is null
  and s_new.product_id = d.product_id
  and lower(trim(s_new.name)) = lower(trim(s_old.name));

-- Remap stock movements the same way
update public.stock_movements sm
set status_id = s_new.id
from public.stock_statuses s_old,
     public.stock_statuses s_new
where sm.status_id = s_old.id
  and s_old.product_id is null
  and s_new.product_id = sm.product_id
  and lower(trim(s_new.name)) = lower(trim(s_old.name));

-- Drop leftover global statuses
delete from public.stock_statuses where product_id is null;

-- Ensure defaults for every product
insert into public.stock_statuses (name, notes, product_id)
select v.name, v.notes, p.id
from public.products p
cross join (values
  ('بدون غربلة', 'الحالة الافتراضية'),
  ('مغربل', null::text)
) as v(name, notes)
where not exists (
  select 1
  from public.stock_statuses s
  where s.product_id = p.id
    and lower(trim(s.name)) = lower(trim(v.name))
);

-- Enforce product_id
do $$
begin
  if exists (select 1 from public.stock_statuses where product_id is null) then
    raise exception 'stock_statuses still has rows without product_id';
  end if;
  alter table public.stock_statuses alter column product_id set not null;
end $$;

drop index if exists public.stock_statuses_product_name_unique;
create unique index stock_statuses_product_name_unique
  on public.stock_statuses (product_id, lower(trim(name)));

create index if not exists stock_statuses_product_idx
  on public.stock_statuses (product_id);

create or replace function public.create_default_product_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stock_statuses s
    where s.product_id = new.id and lower(trim(s.name)) = 'بدون غربلة'
  ) then
    insert into public.stock_statuses (product_id, name, notes)
    values (new.id, 'بدون غربلة', 'الحالة الافتراضية');
  end if;
  if not exists (
    select 1 from public.stock_statuses s
    where s.product_id = new.id and lower(trim(s.name)) = 'مغربل'
  ) then
    insert into public.stock_statuses (product_id, name, notes)
    values (new.id, 'مغربل', null);
  end if;
  return new;
end;
$$;

drop trigger if exists products_default_statuses on public.products;
create trigger products_default_statuses
  after insert on public.products
  for each row execute function public.create_default_product_statuses();
