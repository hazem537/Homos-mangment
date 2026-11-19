-- Per-user Excel/Univer table layout preferences (column widths, fonts, freeze, etc.)

create table public.table_view_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  table_key text not null,
  workbook_styles jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint table_view_prefs_key_nonempty check (char_length(trim(table_key)) > 0),
  constraint table_view_prefs_user_key_unique unique (user_id, table_key)
);

create index table_view_prefs_user_id_idx on public.table_view_prefs (user_id);

create trigger table_view_prefs_updated_at
  before update on public.table_view_prefs
  for each row execute function public.set_updated_at();

alter table public.table_view_prefs enable row level security;

create policy "Users can read own table view prefs"
  on public.table_view_prefs for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own table view prefs"
  on public.table_view_prefs for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own table view prefs"
  on public.table_view_prefs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own table view prefs"
  on public.table_view_prefs for delete to authenticated
  using (auth.uid() = user_id);
