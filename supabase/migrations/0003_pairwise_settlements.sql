-- Migration 0003: Pairwise Settlements Table
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade not null,
  user_a uuid references public.profiles(id) on delete cascade not null,
  user_b uuid references public.profiles(id) on delete cascade not null,
  settled_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Index for fast pairwise settlement lookups
create index if not exists idx_settlements_group_users on public.settlements (group_id, user_a, user_b, settled_at desc);
create index if not exists idx_settlements_settled_at on public.settlements (settled_at desc);

-- Enable RLS
alter table public.settlements enable row level security;

-- Policies for settlements
create policy "Group members can view settlements"
  on public.settlements for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id
      and (gm.user_id = auth.uid() or exists (
        select 1 from public.managed_users mu
        where mu.sponsor_id = auth.uid() and mu.managed_user_id = gm.user_id
      ))
    )
  );

create policy "Group members can insert settlements"
  on public.settlements for insert
  with check (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id
      and (gm.user_id = auth.uid() or exists (
        select 1 from public.managed_users mu
        where mu.sponsor_id = auth.uid() and mu.managed_user_id = gm.user_id
      ))
    )
  );

create policy "Group members can delete settlements"
  on public.settlements for delete
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id
      and (gm.user_id = auth.uid() or exists (
        select 1 from public.managed_users mu
        where mu.sponsor_id = auth.uid() and mu.managed_user_id = gm.user_id
      ))
    )
  );
