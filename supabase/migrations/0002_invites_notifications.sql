-- Migration 0002: Enhanced invites & notifications system

-- 1) Notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'group_invite',
  title text not null,
  message text not null,
  data jsonb default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS for notifications
alter table public.notifications enable row level security;

drop policy if exists "select_own_notifications" on public.notifications;
create policy "select_own_notifications" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "insert_notifications" on public.notifications;
create policy "insert_notifications" on public.notifications
  for insert with check (true);

drop policy if exists "update_own_notifications" on public.notifications;
create policy "update_own_notifications" on public.notifications
  for update using (user_id = auth.uid());

drop policy if exists "delete_own_notifications" on public.notifications;
create policy "delete_own_notifications" on public.notifications
  for delete using (user_id = auth.uid());

-- 2) Update trigger for handle_new_user to process pending email invites
create or replace function public.handle_new_user()
returns trigger as $$
declare
  inv_record record;
begin
  -- Ensure profile exists
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
  )
  on conflict (id) do nothing;

  -- Automatically add user to groups where they have a pending invitation
  for inv_record in
    select gi.id, gi.group_id, gi.invited_by, g.name as group_name
    from public.group_invites gi
    join public.groups g on g.id = gi.group_id
    where gi.email = new.email and gi.status = 'pending'
  loop
    -- Add to group_members
    insert into public.group_members (group_id, user_id, invited_by)
    values (inv_record.group_id, new.id, inv_record.invited_by)
    on conflict (group_id, user_id) do nothing;

    -- Update invite status
    update public.group_invites
    set status = 'accepted'
    where id = inv_record.id;

    -- Create welcome notification
    insert into public.notifications (user_id, type, title, message, data)
    values (
      new.id,
      'group_invite',
      '¡Te has unido al grupo!',
      'Te has unido exitosamente al grupo ' || inv_record.group_name || '.',
      jsonb_build_object('group_id', inv_record.group_id, 'invite_id', inv_record.id)
    );
  end loop;

  return new;
end;
$$ language plpgsql security definer;
