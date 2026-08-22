-- ============================================================================
-- MIGRATION 0002: Managed users table & notification improvements
-- ============================================================================

-- 1) Table for database-level sponsorship / managed users relationship
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

-- Policies for managed_users
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

-- 2) Enhance notifications table
alter table public.notifications add column if not exists link text;
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

-- 3) Ensure profiles table has managed_user_ids column for backward compatibility
alter table public.profiles add column if not exists managed_user_ids uuid[] default '{}'::uuid[];
