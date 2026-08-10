-- Migration 0006: Add UPDATE policy for group_members to support upsert/updates
drop policy if exists "update_group_members" on public.group_members;
create policy "update_group_members" on public.group_members
  for update using (true) with check (true);
