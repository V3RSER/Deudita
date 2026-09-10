-- ============================================================================
-- 02_notifications_and_managed_users.sql
-- Notificaciones y usuarios gestionados (patrocinio).
-- Consolidado desde 0001 (§6) y 0002 (§1-2) — estado final.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NOTIFICACIONES
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'group_invite',
  title text not null,
  message text not null,
  data jsonb default '{}'::jsonb,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications(user_id, is_read);
create index idx_notifications_created_at on public.notifications(created_at desc);

alter table public.notifications enable row level security;

create policy "select_own_notifications" on public.notifications
  for select using (user_id = auth.uid());

create policy "insert_notifications" on public.notifications
  for insert with check (true);

create policy "update_own_notifications" on public.notifications
  for update using (user_id = auth.uid());

create policy "delete_own_notifications" on public.notifications
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- MANAGED USERS (patrocinio / usuarios gestionados)
-- ----------------------------------------------------------------------------
create table public.managed_users (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.profiles(id) on delete cascade,
  managed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_managed_user unique (managed_user_id)
);

create index idx_managed_users_sponsor on public.managed_users(sponsor_id);
create index idx_managed_users_managed on public.managed_users(managed_user_id);

alter table public.managed_users enable row level security;

create policy "Allow authenticated to view managed_users"
  on public.managed_users for select
  to authenticated
  using (true);

create policy "Allow sponsors to insert managed_users"
  on public.managed_users for insert
  to authenticated
  with check (auth.uid() = sponsor_id);

create policy "Allow sponsors to delete managed_users"
  on public.managed_users for delete
  to authenticated
  using (auth.uid() = sponsor_id);
