-- ============================================================================
-- 01_core_schema.sql (IDEMPOTENTE)
-- Núcleo: perfiles, grupos, membresía, invitaciones, storage de uploads.
-- Consolidado desde 0001 (secciones 1, 2, 10) — estado final.
-- Seguro de re-ejecutar cuantas veces sea necesario.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PERFILES
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  avatar_url text,
  timezone text default 'America/Bogota',
  currency text default 'COP',
  currency_symbol text default '$',
  payment_instructions text,
  is_temp boolean not null default false,
  created_by uuid references public.profiles(id),
  onboarding_completed boolean not null default false,
  country text default 'CO',
  managed_user_ids uuid[] default '{}'::uuid[],
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- GRUPOS Y MEMBRESÍA
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'home',
  description text,
  owner_id uuid not null references public.profiles(id),
  currency text default 'COP',
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id),
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending',
  token uuid not null default gen_random_uuid(),
  invitee_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint group_invites_email_or_profile_check
    check (email is not null or invitee_profile_id is not null)
);

create unique index if not exists group_invites_token_key on public.group_invites (token);

-- ----------------------------------------------------------------------------
-- FUNCIÓN AUXILIAR: chequeo de membresía sin recursión de RLS
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

-- ----------------------------------------------------------------------------
-- STORAGE: bucket de uploads
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Access Uploads" on storage.objects;
create policy "Public Access Uploads" on storage.objects
  for select using (bucket_id = 'uploads');

drop policy if exists "Authenticated Insert Uploads" on storage.objects;
create policy "Authenticated Insert Uploads" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.role() = 'authenticated');

drop policy if exists "Authenticated Update Uploads" on storage.objects;
create policy "Authenticated Update Uploads" on storage.objects
  for update using (bucket_id = 'uploads' and auth.role() = 'authenticated');

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

-- ---- profiles ----
drop policy if exists "select_profiles" on public.profiles;
create policy "select_profiles" on public.profiles for select using (true);

drop policy if exists "insert_profiles" on public.profiles;
create policy "insert_profiles" on public.profiles
  for insert with check (auth.uid() = id or is_temp = true);

drop policy if exists "update_profiles" on public.profiles;
create policy "update_profiles" on public.profiles
  for update using (
    auth.uid() = id
    or created_by = auth.uid()
    or (
      is_temp = true
      and exists (
        select 1 from public.group_members gm1
        join public.group_members gm2 on gm1.group_id = gm2.group_id
        where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
      )
    )
  );

drop policy if exists "delete_profiles" on public.profiles;
create policy "delete_profiles" on public.profiles
  for delete using (
    auth.uid() = id
    or created_by = auth.uid()
    or (
      is_temp = true
      and exists (
        select 1 from public.group_members gm1
        join public.group_members gm2 on gm1.group_id = gm2.group_id
        where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
      )
    )
  );

-- ---- groups ----
drop policy if exists "select_own_groups" on public.groups;
create policy "select_own_groups" on public.groups
  for select using (
    public.is_group_member(id, auth.uid())
    or owner_id = auth.uid()
    or exists (select 1 from public.group_invites gi where gi.group_id = groups.id and gi.status = 'pending')
  );

drop policy if exists "insert_own_groups" on public.groups;
create policy "insert_own_groups" on public.groups
  for insert with check (auth.uid() = owner_id);

drop policy if exists "update_own_groups" on public.groups;
create policy "update_own_groups" on public.groups
  for update using (auth.uid() = owner_id);

drop policy if exists "delete_own_groups" on public.groups;
create policy "delete_own_groups" on public.groups
  for delete using (auth.uid() = owner_id);

-- ---- group_members ----
drop policy if exists "select_group_members" on public.group_members;
create policy "select_group_members" on public.group_members
  for select using (
    public.is_group_member(group_id, auth.uid())
    or group_id in (select id from public.groups where owner_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "insert_group_members" on public.group_members;
create policy "insert_group_members" on public.group_members
  for insert with check (
    user_id = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
    or public.is_group_member(group_id, auth.uid())
  );

drop policy if exists "update_group_members" on public.group_members;
create policy "update_group_members" on public.group_members
  for update using (
    user_id = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );

drop policy if exists "delete_group_members" on public.group_members;
create policy "delete_group_members" on public.group_members
  for delete using (
    user_id = auth.uid() or group_id in (select id from public.groups where owner_id = auth.uid())
  );

-- ---- group_invites ----
drop policy if exists "select_group_invites" on public.group_invites;
create policy "select_group_invites" on public.group_invites
  for select using (true);

drop policy if exists "insert_group_invites" on public.group_invites;
create policy "insert_group_invites" on public.group_invites
  for insert with check (
    invited_by = auth.uid()
    and (
      group_id in (select id from public.groups where owner_id = auth.uid())
      or public.is_group_member(group_id, auth.uid())
    )
  );

drop policy if exists "update_group_invites" on public.group_invites;
create policy "update_group_invites" on public.group_invites
  for update using (
    auth.role() = 'authenticated'
    or email = (select email from public.profiles where id = auth.uid())
    or group_id in (select id from public.groups where owner_id = auth.uid())
  );
