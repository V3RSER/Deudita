-- Migration 0005: Allow profiles for virtual/temporary group members without auth.users constraint
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- Update RLS policy for profiles to allow group members to update temp profiles in shared groups
drop policy if exists "update_profiles" on public.profiles;
create policy "update_profiles" on public.profiles
  for update using (
    auth.uid() = id
    or exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );

-- Allow deleting temporary profiles when merging
drop policy if exists "delete_profiles" on public.profiles;
create policy "delete_profiles" on public.profiles
  for delete using (
    auth.uid() = id
    or exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );
