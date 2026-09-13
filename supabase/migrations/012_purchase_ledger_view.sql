-- Purchase ledger view: running weighted avg price (source of truth for read)
-- Recalculates automatically on insert/update/soft-delete — nothing stored to invalidate.

create or replace view public.purchase_ledger
with (security_invoker = true)
as
select
  p.id,
  p.season_id,
  p.supplier_id,
  p.purchase_date,
  p.quantity_kg,
  p.ardab,
  p.price_per_ardab,
  p.total_price,
  p.notes,
  p.is_cancelled,
  p.created_at,
  p.updated_at,
  case
    when sum(p.ardab) over w = 0 then 0::numeric
    else round((sum(p.total_price) over w / sum(p.ardab) over w)::numeric, 4)
  end as running_avg_price
from public.purchases p
where p.is_cancelled = false
window w as (
  partition by p.supplier_id, p.season_id
  order by p.purchase_date asc, p.created_at asc
  rows between unbounded preceding and current row
);

comment on view public.purchase_ledger is
  'Active purchases with running weighted average price per supplier+season. Prefer this for reads; write to purchases.';

grant select on public.purchase_ledger to authenticated;
