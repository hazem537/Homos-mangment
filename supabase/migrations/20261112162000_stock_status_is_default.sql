-- Explicit default stock status per product (used by deliveries).

alter table public.stock_statuses
  add column if not exists is_default boolean not null default false;

-- Prefer existing «بدون غربلة» as default; otherwise first active status by name.
update public.stock_statuses s
set is_default = true
where s.is_active = true
  and s.id = (
    select x.id
    from public.stock_statuses x
    where x.product_id = s.product_id
      and x.is_active = true
    order by
      case when lower(trim(x.name)) = 'بدون غربلة' then 0 else 1 end,
      x.name
    limit 1
  );

create unique index if not exists stock_statuses_one_default_per_product
  on public.stock_statuses (product_id)
  where is_default = true;

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
    insert into public.stock_statuses (product_id, name, notes, is_default)
    values (new.id, 'بدون غربلة', 'الحالة الافتراضية', true);
  else
    update public.stock_statuses
    set is_default = true
    where product_id = new.id
      and lower(trim(name)) = 'بدون غربلة'
      and is_default = false
      and not exists (
        select 1 from public.stock_statuses d
        where d.product_id = new.id and d.is_default = true
      );
  end if;

  if not exists (
    select 1 from public.stock_statuses s
    where s.product_id = new.id and lower(trim(s.name)) = 'مغربل'
  ) then
    insert into public.stock_statuses (product_id, name, notes, is_default)
    values (new.id, 'مغربل', null, false);
  end if;

  return new;
end;
$$;

drop trigger if exists products_default_statuses on public.products;
create trigger products_default_statuses
  after insert on public.products
  for each row execute function public.create_default_product_statuses();
