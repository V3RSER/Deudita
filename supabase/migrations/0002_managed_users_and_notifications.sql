-- ============================================================================
-- MIGRACIÓN UNIFICADA — fusiona 0002, 0003, 0004 y 0005
-- Idempotente: se puede correr sobre una base que ya tenga el ESQUEMA
-- UNIFICADO (versión final) descrito anteriormente.
--
-- INCLUYE:
--   - Tabla managed_users (patrocinio / usuarios gestionados) + políticas
--   - Mejoras a notifications (columna link + índices)
--   - Columna managed_user_ids en profiles (compatibilidad)
--   - Columnas de tiempo en expenses/payments (expense_time, payment_time)
--   - Columnas proof_url/updated_at/updated_by en payments (refuerzo)
--   - Políticas UPDATE/DELETE de payments (refuerzo, ya presentes en el
--     esquema unificado base)
--   - REPLICA IDENTITY FULL + Supabase Realtime en expenses y payments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) MANAGED USERS (patrocinio / usuarios gestionados)
-- ----------------------------------------------------------------------------
create table if not exists public.managed_users (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.profiles(id) on delete cascade,
  managed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_managed_user unique (managed_user_id)
);

create index if not exists idx_managed_users_sponsor on public.managed_users(sponsor_id);
create index if not exists idx_managed_users_managed on public.managed_users(managed_user_id);

alter table public.managed_users enable row level security;

drop policy if exists "Allow authenticated to view managed_users" on public.managed_users;
create policy "Allow authenticated to view managed_users"
  on public.managed_users for select
  to authenticated
  using (true);

drop policy if exists "Allow sponsors to insert managed_users" on public.managed_users;
create policy "Allow sponsors to insert managed_users"
  on public.managed_users for insert
  to authenticated
  with check (auth.uid() = sponsor_id);

drop policy if exists "Allow sponsors to delete managed_users" on public.managed_users;
create policy "Allow sponsors to delete managed_users"
  on public.managed_users for delete
  to authenticated
  using (auth.uid() = sponsor_id);

-- ----------------------------------------------------------------------------
-- 2) NOTIFICACIONES: columna link + índices de rendimiento
-- ----------------------------------------------------------------------------
alter table public.notifications add column if not exists link text;
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

-- ----------------------------------------------------------------------------
-- 3) PROFILES: columna de compatibilidad hacia atrás
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists managed_user_ids uuid[] default '{}'::uuid[];

-- ----------------------------------------------------------------------------
-- 4) CAMPOS DE TIEMPO en expenses y payments
-- ----------------------------------------------------------------------------
alter table public.expenses add column if not exists expense_time timestamptz;
alter table public.payments add column if not exists payment_time timestamptz;
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists updated_by uuid references public.profiles(id);
alter table public.payments add column if not exists proof_url text;

-- Backfill de expense_time / payment_time a partir de la fecha + hora de creación
update public.expenses
set expense_time = (expense_date || ' ' || to_char(created_at, 'HH24:MI:SS'))::timestamptz
where expense_time is null and expense_date is not null;

update public.payments
set payment_time = (payment_date || ' ' || to_char(created_at, 'HH24:MI:SS'))::timestamptz
where payment_time is null and payment_date is not null;

-- ----------------------------------------------------------------------------
-- 5) POLÍTICAS RLS de payments (UPDATE/DELETE) — refuerzo idempotente
-- ----------------------------------------------------------------------------
drop policy if exists "update_group_payments" on public.payments;
create policy "update_group_payments" on public.payments
  for update using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );

drop policy if exists "delete_group_payments" on public.payments;
create policy "delete_group_payments" on public.payments
  for delete using (
    public.is_group_member(group_id, auth.uid())
    or paid_by = auth.uid()
    or paid_to = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 6) SUPABASE REALTIME: expenses y payments
-- ----------------------------------------------------------------------------
alter table public.expenses replica identity full;
alter table public.payments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end;
$$;